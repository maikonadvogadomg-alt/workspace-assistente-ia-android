export type AIProvider = "openai" | "anthropic" | "perplexity" | "gemini" | "groq" | "mistral" | "openrouter";

export interface AIConfig {
  provider: AIProvider;
  apiKey: string;
  model: string;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

export const PROVIDER_MODELS: Record<AIProvider, { id: string; label: string }[]> = {
  openai: [
    { id: "gpt-4o", label: "GPT-4o" },
    { id: "gpt-4o-mini", label: "GPT-4o Mini" },
    { id: "gpt-4-turbo", label: "GPT-4 Turbo" },
    { id: "o1-mini", label: "o1 Mini" },
  ],
  anthropic: [
    { id: "claude-opus-4-5", label: "Claude Opus 4.5" },
    { id: "claude-sonnet-4-5", label: "Claude Sonnet 4.5" },
    { id: "claude-haiku-3-5", label: "Claude Haiku 3.5" },
    { id: "claude-3-5-sonnet-20241022", label: "Claude 3.5 Sonnet" },
  ],
  perplexity: [
    { id: "llama-3.1-sonar-large-128k-online", label: "Sonar Large (com internet)" },
    { id: "llama-3.1-sonar-small-128k-online", label: "Sonar Small (com internet)" },
    { id: "llama-3.1-sonar-huge-128k-online", label: "Sonar Huge (com internet)" },
  ],
  gemini: [
    { id: "gemini-2.0-flash-exp", label: "Gemini 2.0 Flash" },
    { id: "gemini-1.5-pro", label: "Gemini 1.5 Pro" },
    { id: "gemini-1.5-flash", label: "Gemini 1.5 Flash" },
  ],
  groq: [
    { id: "llama-3.3-70b-versatile", label: "Llama 3.3 70B" },
    { id: "llama-3.1-8b-instant", label: "Llama 3.1 8B (ultrarrápido)" },
    { id: "mixtral-8x7b-32768", label: "Mixtral 8x7B" },
    { id: "gemma2-9b-it", label: "Gemma 2 9B" },
  ],
  mistral: [
    { id: "mistral-large-latest", label: "Mistral Large" },
    { id: "mistral-medium-latest", label: "Mistral Medium" },
    { id: "open-mistral-7b", label: "Mistral 7B" },
  ],
  openrouter: [
    { id: "openai/gpt-4o", label: "GPT-4o" },
    { id: "anthropic/claude-3.5-sonnet", label: "Claude 3.5 Sonnet" },
    { id: "anthropic/claude-3.5-haiku", label: "Claude 3.5 Haiku" },
    { id: "google/gemini-pro-1.5", label: "Gemini 1.5 Pro" },
    { id: "meta-llama/llama-3.3-70b-instruct", label: "Llama 3.3 70B" },
    { id: "perplexity/llama-3.1-sonar-large-128k-online", label: "Perplexity Sonar (internet)" },
    { id: "mistralai/mixtral-8x7b-instruct", label: "Mixtral 8x7B" },
  ],
};

export const PROVIDER_LABELS: Record<AIProvider, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic / Claude",
  perplexity: "Perplexity (internet)",
  gemini: "Google Gemini",
  groq: "Groq (gratuito e rápido)",
  mistral: "Mistral",
  openrouter: "OpenRouter (todos em 1)",
};

export const PROVIDER_KEY_HINTS: Record<AIProvider, string> = {
  openai: "sk-...",
  anthropic: "sk-ant-... (⚠ via servidor)",
  perplexity: "pplx-...",
  gemini: "AIza...",
  groq: "gsk_...",
  mistral: "...",
  openrouter: "sk-or-...",
};

export function detectProvider(key: string): AIProvider | null {
  const k = key.trim();
  if (k.startsWith("sk-ant-")) return "anthropic";
  if (k.startsWith("pplx-")) return "perplexity";
  if (k.startsWith("gsk_")) return "groq";
  if (k.startsWith("sk-or-")) return "openrouter";
  if (k.startsWith("AIza")) return "gemini";
  if (/^[a-zA-Z0-9]{32}$/.test(k)) return "mistral";
  if (k.startsWith("sk-")) return "openai";
  return null;
}

export function defaultModelFor(provider: AIProvider): string {
  return PROVIDER_MODELS[provider][0].id;
}

// Providers that support direct browser fetch (no CORS issues)
const DIRECT_PROVIDERS: AIProvider[] = ["openai", "perplexity", "groq", "mistral", "openrouter"];

async function streamOpenAICompat(
  url: string,
  headers: Record<string, string>,
  body: object,
  onChunk: (t: string) => void,
  onDone: () => void,
  onError: (e: string) => void,
) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    let msg = text;
    try { msg = JSON.parse(text).error?.message ?? text; } catch {}
    onError(msg);
    return;
  }

  const reader = res.body?.getReader();
  if (!reader) { onError("Sem resposta"); return; }

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const data = line.slice(6).trim();
        if (data === "[DONE]") { onDone(); return; }
        try {
          const json = JSON.parse(data);
          const content = json.choices?.[0]?.delta?.content ?? "";
          if (content) onChunk(content);
        } catch {}
      }
    }
  }
  onDone();
}

export async function streamChat(
  config: AIConfig,
  messages: Message[],
  systemPrompt: string,
  onChunk: (text: string) => void,
  onDone: () => void,
  onError: (err: string) => void,
) {
  const sys = systemPrompt || "Você é uma assistente jurídica inteligente, precisa e profissional. Responda sempre em português do Brasil de forma clara e detalhada.";
  const msgs = messages.map((m) => ({ role: m.role, content: m.content }));
  const sysMsgs = [{ role: "system", content: sys }];

  try {
    // Gemini: direct REST (no streaming, but no CORS issues with API key)
    if (config.provider === "gemini") {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent?key=${config.apiKey}`;
      const geminiMsgs = messages.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));
      const body: Record<string, unknown> = {
        contents: geminiMsgs,
        systemInstruction: { parts: [{ text: sys }] },
      };
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const t = await res.text();
        let msg = t;
        try { msg = JSON.parse(t).error?.message ?? t; } catch {}
        onError(msg);
        return;
      }
      const data = await res.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      onChunk(text);
      onDone();
      return;
    }

    // Anthropic: needs server proxy due to CORS (only route via backend)
    if (config.provider === "anthropic") {
      const res = await fetch(`/api/ai/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "anthropic",
          apiKey: config.apiKey,
          model: config.model,
          systemPrompt: sys,
          messages: msgs,
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        onError(body || `Erro ${res.status}`);
        return;
      }
      const reader = res.body?.getReader();
      if (!reader) { onError("Sem resposta"); return; }
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6).trim();
            if (data === "[DONE]") { onDone(); return; }
            try { const j = JSON.parse(data); if (j.text) onChunk(j.text); } catch {}
          }
        }
      }
      onDone();
      return;
    }

    // OpenAI-compatible providers: direct from browser
    const endpoints: Record<string, string> = {
      openai: "https://api.openai.com/v1/chat/completions",
      perplexity: "https://api.perplexity.ai/chat/completions",
      groq: "https://api.groq.com/openai/v1/chat/completions",
      mistral: "https://api.mistral.ai/v1/chat/completions",
      openrouter: "https://openrouter.ai/api/v1/chat/completions",
    };

    const url = endpoints[config.provider];
    if (!url) { onError(`Provedor desconhecido: ${config.provider}`); return; }

    const extraHeaders: Record<string, string> =
      config.provider === "openrouter"
        ? { "HTTP-Referer": location.origin, "X-Title": "Assistente IA Jurídico" }
        : {};

    await streamOpenAICompat(
      url,
      { Authorization: `Bearer ${config.apiKey}`, ...extraHeaders },
      { model: config.model, stream: true, messages: [...sysMsgs, ...msgs] },
      onChunk, onDone, onError,
    );
  } catch (e: unknown) {
    onError(e instanceof Error ? e.message : "Erro desconhecido");
  }
}
