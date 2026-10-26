import { requestUrl } from "obsidian";

const API_BASE = "https://openrouter.ai/api/v1";

export interface OpenRouterModel {
	id: string;
	name: string;
}

export interface ChatMessage {
	role: "system" | "user" | "assistant";
	content: string;
}

export interface ChatOptions {
	apiKey: string;
	model: string;
	messages: ChatMessage[];
	temperature: number;
	maxTokens: number;
}

// Obsidian's requestUrl bypasses CORS and works on both desktop and mobile.
export async function chatCompletion(opts: ChatOptions): Promise<string> {
	const res = await requestUrl({
		url: `${API_BASE}/chat/completions`,
		method: "POST",
		contentType: "application/json",
		headers: {
			Authorization: `Bearer ${opts.apiKey}`,
			"HTTP-Referer": "https://obsidian.md",
			"X-Title": "Obsidian Explain",
		},
		body: JSON.stringify({
			model: opts.model,
			messages: opts.messages,
			temperature: opts.temperature,
			max_tokens: opts.maxTokens,
		}),
		throw: false,
	});

	const json = safeJson(res.text);
	if (res.status >= 400) {
		const msg = json?.error?.message ?? res.text ?? "Unknown error";
		throw new Error(`OpenRouter ${res.status}: ${msg}`);
	}
	if (json?.error) {
		throw new Error(`OpenRouter: ${json.error.message ?? JSON.stringify(json.error)}`);
	}
	const content: unknown = json?.choices?.[0]?.message?.content;
	if (typeof content !== "string" || !content.trim()) {
		throw new Error("OpenRouter returned an empty response.");
	}
	return stripCodeFence(content.trim());
}

let modelCache: OpenRouterModel[] | null = null;

export async function listModels(): Promise<OpenRouterModel[]> {
	if (modelCache) return modelCache;
	const res = await requestUrl({ url: `${API_BASE}/models`, throw: false });
	if (res.status >= 400) throw new Error(`Could not load models (${res.status})`);
	const data: unknown = safeJson(res.text)?.data;
	if (!Array.isArray(data)) return [];
	modelCache = data
		.filter((m) => typeof m?.id === "string")
		.map((m) => ({ id: m.id, name: typeof m.name === "string" ? m.name : m.id }))
		.sort((a, b) => a.id.localeCompare(b.id));
	return modelCache;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function safeJson(text: string): any {
	try {
		return JSON.parse(text);
	} catch {
		return null;
	}
}

// Some models wrap the whole answer in ```markdown ... ```; unwrap it.
function stripCodeFence(text: string): string {
	const m = text.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/i);
	return m ? m[1].trim() : text;
}
