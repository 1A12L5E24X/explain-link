import { AbstractInputSuggest, App, Notice, PluginSettingTab, Setting, TFolder } from "obsidian";
import type ExplainPlugin from "./main";
import { listModels, OpenRouterModel, testConnection } from "./openrouter";

export interface ExplainSettings {
	apiKey: string;
	model: string;
	folder: string;
	systemPrompt: string;
	promptTemplate: string;
	contextChars: number;
	temperature: number;
	maxTokens: number;
	reuseExisting: boolean;
	openAfterCreate: boolean;
}

export const DEFAULT_SYSTEM_PROMPT =
	"You are a clear, knowledgeable tutor writing notes for an Obsidian knowledge base. " +
	"Answer in Markdown. Do not wrap the answer in a code block, do not add a top-level heading, " +
	"and do not repeat the selected text verbatim at the start. Be accurate and concise.";

export const DEFAULT_PROMPT_TEMPLATE = `Explain the following {{kind}} as it is used in the context below.

{{kind}}:
"""
{{text}}
"""

Context (from the note "{{title}}"):
"""
{{context}}
"""

If it is a word or short term: give a one-line definition, what it means in this context, and a short example.
If it is a sentence or passage: explain what it means in plain language, then list the key concepts it relies on.`;

export const DEFAULT_SETTINGS: ExplainSettings = {
	apiKey: "",
	model: "openai/gpt-4o-mini",
	folder: "Explanations",
	systemPrompt: DEFAULT_SYSTEM_PROMPT,
	promptTemplate: DEFAULT_PROMPT_TEMPLATE,
	contextChars: 800,
	temperature: 0.3,
	maxTokens: 1200,
	reuseExisting: true,
	openAfterCreate: false,
};

export class ExplainSettingTab extends PluginSettingTab {
	constructor(app: App, private plugin: ExplainPlugin) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		const s = this.plugin.settings;
		containerEl.empty();

		new Setting(containerEl)
			.setName("OpenRouter API key")
			.setDesc("Create one at openrouter.ai/keys. Stored in this vault's plugin data.json.")
			.addText((text) => {
				text.inputEl.type = "password";
				text.setPlaceholder("sk-or-...")
					.setValue(s.apiKey)
					.onChange(async (v) => {
						s.apiKey = v.trim();
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("Test connection")
			.setDesc("Checks that openrouter.ai is reachable and the API key works.")
			.addButton((b) =>
				b.setButtonText("Test").onClick(async () => {
					if (!s.apiKey) {
						new Notice("Explain: enter an API key first.");
						return;
					}
					b.setDisabled(true).setButtonText("Testing…");
					try {
						new Notice(`Explain: ${await testConnection(s.apiKey)}`, 6000);
					} catch (e) {
						new Notice(`Explain: ${(e as Error).message}`, 10000);
					} finally {
						b.setDisabled(false).setButtonText("Test");
					}
				}),
			);

		new Setting(containerEl)
			.setName("Model")
			.setDesc("Any OpenRouter model id. Start typing to search the model list.")
			.addText((text) => {
				new ModelSuggest(this.app, text.inputEl, async (id) => {
					s.model = id;
					await this.plugin.saveSettings();
				});
				text.setPlaceholder(DEFAULT_SETTINGS.model)
					.setValue(s.model)
					.onChange(async (v) => {
						s.model = v.trim();
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("Explanations folder")
			.setDesc("Where explanation notes are created. Created automatically if missing.")
			.addText((text) => {
				new FolderSuggest(this.app, text.inputEl, async (path) => {
					s.folder = path;
					await this.plugin.saveSettings();
				});
				text.setPlaceholder(DEFAULT_SETTINGS.folder)
					.setValue(s.folder)
					.onChange(async (v) => {
						s.folder = v.trim();
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("Reuse existing explanations")
			.setDesc("If the same text was explained before, link to the existing note instead of calling the API again.")
			.addToggle((t) =>
				t.setValue(s.reuseExisting).onChange(async (v) => {
					s.reuseExisting = v;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName("Open explanation after creating")
			.setDesc("Open the new note in a new tab once it has been generated.")
			.addToggle((t) =>
				t.setValue(s.openAfterCreate).onChange(async (v) => {
					s.openAfterCreate = v;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl).setName("Generation").setHeading();

		new Setting(containerEl)
			.setName("Context size")
			.setDesc("Characters of surrounding text sent with the selection, on each side.")
			.addText((text) =>
				text.setValue(String(s.contextChars)).onChange(async (v) => {
					const n = parseInt(v, 10);
					if (!isNaN(n) && n >= 0) {
						s.contextChars = n;
						await this.plugin.saveSettings();
					}
				}),
			);

		new Setting(containerEl)
			.setName("Temperature")
			.addSlider((sl) =>
				sl
					.setLimits(0, 1.5, 0.1)
					.setValue(s.temperature)
					.setDynamicTooltip()
					.onChange(async (v) => {
						s.temperature = v;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Max tokens")
			.addText((text) =>
				text.setValue(String(s.maxTokens)).onChange(async (v) => {
					const n = parseInt(v, 10);
					if (!isNaN(n) && n > 0) {
						s.maxTokens = n;
						await this.plugin.saveSettings();
					}
				}),
			);

		new Setting(containerEl)
			.setName("System prompt")
			.addTextArea((ta) => {
				ta.inputEl.rows = 4;
				ta.inputEl.addClass("explain-wide-textarea");
				ta.setValue(s.systemPrompt).onChange(async (v) => {
					s.systemPrompt = v;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName("Prompt template")
			.setDesc("Placeholders: {{text}}, {{context}}, {{title}}, {{kind}} (word / phrase / sentence / passage).")
			.addTextArea((ta) => {
				ta.inputEl.rows = 12;
				ta.inputEl.addClass("explain-wide-textarea");
				ta.setValue(s.promptTemplate).onChange(async (v) => {
					s.promptTemplate = v;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl).addButton((b) =>
			b.setButtonText("Reset prompts to default").onClick(async () => {
				s.systemPrompt = DEFAULT_SYSTEM_PROMPT;
				s.promptTemplate = DEFAULT_PROMPT_TEMPLATE;
				await this.plugin.saveSettings();
				this.display();
			}),
		);
	}
}

class FolderSuggest extends AbstractInputSuggest<TFolder> {
	constructor(app: App, private inputEl: HTMLInputElement, private onPick: (path: string) => void) {
		super(app, inputEl);
	}

	getSuggestions(query: string): TFolder[] {
		const q = query.toLowerCase();
		return this.app.vault
			.getAllLoadedFiles()
			.filter((f): f is TFolder => f instanceof TFolder && !f.isRoot() && f.path.toLowerCase().includes(q))
			.slice(0, 50);
	}

	renderSuggestion(folder: TFolder, el: HTMLElement): void {
		el.setText(folder.path);
	}

	selectSuggestion(folder: TFolder): void {
		this.setValue(folder.path);
		this.onPick(folder.path);
		this.close();
	}
}

class ModelSuggest extends AbstractInputSuggest<OpenRouterModel> {
	private models: OpenRouterModel[] = [];

	constructor(app: App, private inputEl: HTMLInputElement, private onPick: (id: string) => void) {
		super(app, inputEl);
		listModels()
			.then((m) => (this.models = m))
			.catch(() => (this.models = []));
	}

	getSuggestions(query: string): OpenRouterModel[] {
		const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
		return this.models
			.filter((m) => {
				const hay = `${m.id} ${m.name}`.toLowerCase();
				return terms.every((t) => hay.includes(t));
			})
			.slice(0, 50);
	}

	renderSuggestion(model: OpenRouterModel, el: HTMLElement): void {
		el.createDiv({ text: model.name });
		el.createEl("small", { text: model.id, cls: "explain-muted" });
	}

	selectSuggestion(model: OpenRouterModel): void {
		this.setValue(model.id);
		this.onPick(model.id);
		this.close();
	}
}
