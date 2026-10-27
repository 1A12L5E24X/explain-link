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

export async function chatCompletion(opts: ChatOptions): Promise<string> {
	const res = await httpRequest(`${API_BASE}/chat/completions`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${cleanKey(opts.apiKey)}`,
			"Content-Type": "application/json",
			"X-Title": "Obsidian Explain Link",
		},
		body: JSON.stringify({
			model: opts.model,
			messages: opts.messages,
			temperature: opts.temperature,
			max_tokens: opts.maxTokens,
		}),
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

// Checks connectivity and the API key; returns a short human-readable status.
export async function testConnection(apiKey: string): Promise<string> {
	const res = await httpRequest(`${API_BASE}/key`, {
		method: "GET",
		headers: { Authorization: `Bearer ${cleanKey(apiKey)}` },
	});
	const json = safeJson(res.text);
	if (res.status === 401) throw new Error("OpenRouter rejected the API key (401).");
	if (res.status >= 400) throw new Error(`OpenRouter ${res.status}: ${json?.error?.message ?? res.text}`);
	const data = json?.data;
	const usage = typeof data?.usage === "number" ? ` Usage so far: $${data.usage.toFixed(4)}.` : "";
	return `Connected. API key is valid.${usage}`;
}

let modelCache: OpenRouterModel[] | null = null;

export async function listModels(): Promise<OpenRouterModel[]> {
	if (modelCache) return modelCache;
	const res = await httpRequest(`${API_BASE}/models`, { method: "GET", headers: {} });
	if (res.status >= 400) throw new Error(`Could not load models (${res.status})`);
	const data: unknown = safeJson(res.text)?.data;
	if (!Array.isArray(data)) return [];
	modelCache = data
		.filter((m) => typeof m?.id === "string")
		.map((m) => ({ id: m.id, name: typeof m.name === "string" ? m.name : m.id }))
		.sort((a, b) => a.id.localeCompare(b.id));
	return modelCache;
}

interface HttpOptions {
	method: "GET" | "POST";
	headers: Record<string, string>;
	body?: string;
}

interface HttpResponse {
	status: number;
	text: string;
}

// Obsidian's requestUrl bypasses CORS and works on desktop and mobile, but on some
// setups (VPNs, proxies, firewalls, certain Electron builds) it fails with a bare
// "net::ERR_FAILED". OpenRouter allows browser CORS, so fall back to fetch() then.
async function httpRequest(url: string, opts: HttpOptions): Promise<HttpResponse> {
	let firstError: unknown;
	try {
		const res = await requestUrl({ url, ...opts, throw: false });
		return { status: res.status, text: res.text };
	} catch (e) {
		firstError = e;
	}
	try {
		const res = await fetch(url, opts);
		return { status: res.status, text: await res.text() };
	} catch (e) {
		const detail = (firstError as Error)?.message || (e as Error)?.message || String(e);
		throw new Error(
			`Could not reach openrouter.ai (${detail}). Check your internet connection, ` +
				"and whether a VPN, proxy or firewall blocks openrouter.ai.",
		);
	}
}

// Pasted keys sometimes carry invisible characters (newlines, zero-width spaces,
// non-breaking spaces) that make the Authorization header invalid.
function cleanKey(key: string): string {
	return key.replace(/[^\x21-\x7e]/g, "");
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
