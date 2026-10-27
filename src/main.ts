import { Editor, MarkdownFileInfo, MarkdownView, Menu, normalizePath, Notice, Plugin, TFile, TFolder } from "obsidian";
import { chatCompletion } from "./openrouter";
import { DEFAULT_SETTINGS, ExplainSettings, ExplainSettingTab } from "./settings";
import { buildBody, canBeLinkText, classify, fillTemplate, Kind, normalize, noteTitle, replaceBody } from "./text";

const PENDING = "⏳ *Generating explanation…*\n";

// Frontmatter keys written to every explanation note.
const FM_SOURCE = "explain-source";
const FM_FROM = "explain-from";
const FM_MODEL = "explain-model";

interface Request {
	text: string;
	kind: Kind;
	context: string;
	title: string;
}

export default class ExplainPlugin extends Plugin {
	settings: ExplainSettings = DEFAULT_SETTINGS;

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new ExplainSettingTab(this.app, this));

		this.registerEvent(
			this.app.workspace.on("editor-menu", (menu: Menu, editor: Editor, info: MarkdownView | MarkdownFileInfo) => {
				if (!editor.getSelection().trim()) return;
				menu.addItem((item) =>
					item
						.setTitle("Explain")
						.setIcon("sparkles")
						.setSection("selection")
						.onClick(() => this.explainSelection(editor, info.file)),
				);
			}),
		);

		this.addCommand({
			id: "explain-selection",
			name: "Explain selected text",
			editorCheckCallback: (checking, editor, info) => {
				if (!editor.getSelection().trim()) return false;
				if (!checking) this.explainSelection(editor, info.file);
				return true;
			},
		});

		this.addCommand({
			id: "regenerate-explanation",
			name: "Regenerate explanation in current note",
			checkCallback: (checking) => {
				const file = this.app.workspace.getActiveFile();
				const fm = file && this.app.metadataCache.getFileCache(file)?.frontmatter;
				if (!file || typeof fm?.[FM_SOURCE] !== "string") return false;
				if (!checking) this.regenerate(file, fm[FM_SOURCE], fm[FM_FROM]);
				return true;
			},
		});
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	private async explainSelection(editor: Editor, sourceFile: TFile | null) {
		if (!this.settings.apiKey) {
			new Notice("Explain: set your OpenRouter API key in the plugin settings first.");
			return;
		}
		if (!this.settings.model) {
			new Notice("Explain: choose a model in the plugin settings first.");
			return;
		}

		const selection = editor.getSelection();
		const text = selection.trim();
		const from = editor.posToOffset(editor.getCursor("from"));
		const to = editor.posToOffset(editor.getCursor("to"));
		const doc = editor.getValue();
		const n = this.settings.contextChars;
		const req: Request = {
			text,
			kind: classify(text),
			context: doc.slice(Math.max(0, from - n), Math.min(doc.length, to + n)),
			title: sourceFile?.basename ?? "Untitled",
		};

		let file: TFile;
		let isNew: boolean;
		try {
			({ file, isNew } = await this.resolveNote(req, sourceFile));
		} catch (e) {
			new Notice(`Explain: could not create note: ${(e as Error).message}`);
			return;
		}

		// Insert the link right away, while the selection offsets are still valid;
		// the API call can take several seconds and the user may keep typing.
		this.insertLink(editor, file, sourceFile, selection, from, to);

		if (!isNew) {
			new Notice(`Explain: linked existing note "${file.basename}".`);
			return;
		}
		new Notice(`Explain: generating "${file.basename}"…`);
		await this.generateInto(file, req);
	}

	private async regenerate(file: TFile, text: string, fromLink: unknown) {
		let context = "";
		let title = "Untitled";
		const src = typeof fromLink === "string" ? this.resolveLink(fromLink, file.path) : null;
		if (src) {
			title = src.basename;
			const data = await this.app.vault.cachedRead(src);
			const i = data.indexOf(text);
			const n = this.settings.contextChars;
			if (i >= 0) context = data.slice(Math.max(0, i - n), i + text.length + n);
		}
		await this.app.vault.process(file, (d) => replaceBody(d, PENDING));
		new Notice(`Explain: regenerating "${file.basename}"…`);
		await this.generateInto(file, { text, kind: classify(text), context, title });
	}

	private async generateInto(file: TFile, req: Request) {
		const s = this.settings;
		try {
			const explanation = await chatCompletion({
				apiKey: s.apiKey,
				model: s.model,
				temperature: s.temperature,
				maxTokens: s.maxTokens,
				messages: [
					{ role: "system", content: s.systemPrompt },
					{
						role: "user",
						content: fillTemplate(s.promptTemplate, {
							text: req.text,
							kind: req.kind,
							context: req.context || "(no context)",
							title: req.title,
						}),
					},
				],
			});
			await this.app.vault.process(file, (d) => replaceBody(d, buildBody(req.text, req.kind, explanation)));
			await this.app.fileManager.processFrontMatter(file, (fm) => {
				fm[FM_MODEL] = s.model;
			});
			new Notice(`Explain: "${file.basename}" is ready.`);
			if (s.openAfterCreate) await this.app.workspace.getLeaf("tab").openFile(file);
		} catch (e) {
			const msg = (e as Error).message;
			await this.app.vault.process(file, (d) =>
				replaceBody(
					d,
					`> [!error] Explanation failed\n> ${msg.replace(/\n/g, "\n> ")}\n>\n` +
						`> Open this note and run **Explain: Regenerate explanation in current note** to try again.\n`,
				),
			);
			new Notice(`Explain failed: ${msg}`, 8000);
		}
	}

	// Finds an existing explanation for the same text, or creates a new placeholder note.
	private async resolveNote(req: Request, sourceFile: TFile | null): Promise<{ file: TFile; isNew: boolean }> {
		const folder = normalizePath(this.settings.folder || "/");
		await this.ensureFolder(folder);

		const base = noteTitle(req.text);
		const key = normalize(req.text);
		const prefix = folder === "/" ? "" : `${folder}/`;

		for (let i = 1; ; i++) {
			const path = normalizePath(`${prefix}${i === 1 ? base : `${base} ${i}`}.md`);
			const existing = this.findFileInsensitive(path);
			if (!existing) {
				const file = await this.app.vault.create(path, PENDING);
				await this.app.fileManager.processFrontMatter(file, (fm) => {
					fm[FM_SOURCE] = req.text;
					if (sourceFile) fm[FM_FROM] = `[[${this.app.metadataCache.fileToLinktext(sourceFile, path)}]]`;
					fm["created"] = new Date().toISOString().slice(0, 10);
				});
				return { file, isNew: true };
			}
			const src = this.app.metadataCache.getFileCache(existing)?.frontmatter?.[FM_SOURCE];
			if (this.settings.reuseExisting && typeof src === "string" && normalize(src) === key) {
				return { file: existing, isNew: false };
			}
		}
	}

	private insertLink(editor: Editor, target: TFile, sourceFile: TFile | null, selection: string, from: number, to: number) {
		const sourcePath = sourceFile?.path ?? "";
		const text = selection.trim();

		if (canBeLinkText(text)) {
			// Turn the selection itself into the link, keeping any surrounding whitespace.
			const lead = selection.match(/^\s*/)?.[0] ?? "";
			const trail = selection.match(/\s*$/)?.[0] ?? "";
			const link = this.app.fileManager.generateMarkdownLink(target, sourcePath, undefined, text);
			editor.replaceRange(lead + link + trail, editor.offsetToPos(from), editor.offsetToPos(to));
			return;
		}

		// Multi-line passages can't be link text, so append a small link after them instead.
		let end = to;
		while (end > from && /\s/.test(selection[end - from - 1])) end--;
		const link = this.app.fileManager.generateMarkdownLink(target, sourcePath, undefined, "explained");
		editor.replaceRange(` (${link})`, editor.offsetToPos(end));
	}

	private resolveLink(link: string, fromPath: string): TFile | null {
		const m = link.match(/^\[\[([^\]|#]+)/);
		return m ? this.app.metadataCache.getFirstLinkpathDest(m[1], fromPath) : null;
	}

	private findFileInsensitive(path: string): TFile | null {
		const exact = this.app.vault.getAbstractFileByPath(path);
		if (exact instanceof TFile) return exact;
		const lower = path.toLowerCase();
		return this.app.vault.getMarkdownFiles().find((f) => f.path.toLowerCase() === lower) ?? null;
	}

	private async ensureFolder(path: string) {
		if (path === "/" || this.app.vault.getAbstractFileByPath(path) instanceof TFolder) return;
		let current = "";
		for (const part of path.split("/")) {
			current = current ? `${current}/${part}` : part;
			if (!this.app.vault.getAbstractFileByPath(current)) await this.app.vault.createFolder(current);
		}
	}
}
