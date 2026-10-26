// Pure helpers with no Obsidian dependency, so they are easy to reason about and test.

export type Kind = "word" | "phrase" | "sentence" | "passage";

export function classify(text: string): Kind {
	const t = text.trim();
	if (!/\s/.test(t)) return "word";
	const words = t.split(/\s+/).length;
	if (words <= 5 && !/[.!?]\s/.test(t)) return "phrase";
	if (!t.includes("\n") && (t.match(/[.!?](\s|$)/g) ?? []).length <= 1) return "sentence";
	return "passage";
}

const MAX_TITLE = 60;

// Characters that are invalid in file names on some OS, or that break wikilinks.
const FORBIDDEN = /[\\/:*?"<>|#^[\]]/g;

export function noteTitle(text: string): string {
	let t = text.replace(FORBIDDEN, " ").replace(/\s+/g, " ").trim();
	t = t.replace(/^\.+/, "").replace(/[. ]+$/, "");
	if (t.length > MAX_TITLE) {
		const cut = t.slice(0, MAX_TITLE);
		const lastSpace = cut.lastIndexOf(" ");
		t = (lastSpace > MAX_TITLE / 2 ? cut.slice(0, lastSpace) : cut).trim() + "…";
	}
	return t || "Explanation";
}

// Used to decide whether two selections are "the same thing" for reuse.
export function normalize(text: string): string {
	return text.replace(/\s+/g, " ").trim().toLowerCase();
}

// A selection can be used as the visible text of a link only if it is a single
// line and contains no characters that would terminate the link syntax.
export function canBeLinkText(text: string): boolean {
	return !/[\n\r|[\]]/.test(text.trim());
}

export function fillTemplate(template: string, vars: Record<string, string>): string {
	return template.replace(/\{\{(\w+)\}\}/g, (m, key: string) => (key in vars ? vars[key] : m));
}

export function buildBody(text: string, kind: Kind, explanation: string): string {
	if (kind === "word" || kind === "phrase") return `${explanation}\n`;
	const quoted = text
		.trim()
		.split("\n")
		.map((l) => `> ${l}`)
		.join("\n");
	return `> [!quote] Explained ${kind}\n${quoted}\n\n${explanation}\n`;
}

export function replaceBody(data: string, body: string): string {
	const fm = data.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
	return (fm ? fm[0] : "") + body;
}
