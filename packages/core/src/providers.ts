import { LLMProvider, ChatMessage, StreamEvent } from "./index";

export class OpenAICompatProvider implements LLMProvider {
  constructor(public id: string, public name: string, private baseUrl: string, private apiKey: string, public defaultModel: string) {}
  capabilities = { vision: false, tools: true, json: true, contextWindow: 8192 };
  async listModels() { return [this.defaultModel]; }
  async health() { try { const r = await fetch(this.baseUrl + "/models", { headers: this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {} }); return r.ok; } catch { return false; } }
  async *stream(messages: ChatMessage[], options?: { model?: string; signal?: AbortSignal }): AsyncGenerator<StreamEvent> {
    const model = options?.model || this.defaultModel;
    const res = await fetch(this.baseUrl + "/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}) },
      body: JSON.stringify({ model, messages, stream: true }),
      signal: options?.signal,
    });
    if (!res.ok || !res.body) { yield { type: "error", data: await res.text() }; yield { type: "done" }; return; }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() || "";
      for (const line of lines) {
        const t = line.trim();
        if (!t.startsWith("data:")) continue;
        const payload = t.slice(5).trim();
        if (payload === "[DONE]") { yield { type: "done" }; return; }
        try {
          const j = JSON.parse(payload);
          const delta = j.choices?.[0]?.delta?.content;
          if (delta) yield { type: "token", data: delta };
        } catch {}
      }
    }
    yield { type: "done" };
  }
}

export interface ProviderInfo { id: string; name: string; baseUrl: string; defaultModel: string; needsKey: boolean; }

export const PROVIDERS: ProviderInfo[] = [
  { id: "mock", name: "Mock (no key)", baseUrl: "", defaultModel: "mock-1", needsKey: false },
  { id: "groq", name: "Groq", baseUrl: "https://api.groq.com/openai/v1", defaultModel: "openai/gpt-oss-20b", needsKey: true },
  { id: "openrouter", name: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", defaultModel: "meta-llama/llama-3.3-70b-instruct:free", needsKey: true },
  { id: "openai", name: "OpenAI", baseUrl: "https://api.openai.com/v1", defaultModel: "gpt-4o-mini", needsKey: true },
  { id: "mistral", name: "Mistral", baseUrl: "https://api.mistral.ai/v1", defaultModel: "mistral-small-latest", needsKey: true },
  { id: "cerebras", name: "Cerebras", baseUrl: "https://api.cerebras.ai/v1", defaultModel: "llama3.1-8b", needsKey: true },
  { id: "together", name: "Together AI", baseUrl: "https://api.together.xyz/v1", defaultModel: "meta-llama/Llama-3.3-70B-Instruct-Turbo", needsKey: true },
  { id: "fireworks", name: "Fireworks", baseUrl: "https://api.fireworks.ai/inference/v1", defaultModel: "accounts/fireworks/models/llama-v3p1-8b-instruct", needsKey: true },
  { id: "deepseek", name: "DeepSeek", baseUrl: "https://api.deepseek.com/v1", defaultModel: "deepseek-chat", needsKey: true },
  { id: "perplexity", name: "Perplexity", baseUrl: "https://api.perplexity.ai", defaultModel: "sonar", needsKey: true },
  { id: "xai", name: "xAI (Grok)", baseUrl: "https://api.x.ai/v1", defaultModel: "grok-2-latest", needsKey: true },
  { id: "deepinfra", name: "DeepInfra", baseUrl: "https://api.deepinfra.com/v1/openai", defaultModel: "meta-llama/Meta-Llama-3.1-8B-Instruct", needsKey: true },
  { id: "huggingface", name: "Hugging Face", baseUrl: "https://api-inference.huggingface.co/v1", defaultModel: "meta-llama/Llama-3.1-8B-Instruct", needsKey: true },
  { id: "nvidia", name: "NVIDIA NIM", baseUrl: "https://integrate.api.nvidia.com/v1", defaultModel: "meta/llama-3.1-8b-instruct", needsKey: true },
  { id: "github", name: "GitHub Models", baseUrl: "https://models.inference.ai.azure.com", defaultModel: "gpt-4o-mini", needsKey: true },
  { id: "sambanova", name: "SambaNova", baseUrl: "https://api.sambanova.ai/v1", defaultModel: "Meta-Llama-3.1-8B-Instruct", needsKey: true },
  { id: "ollama", name: "Ollama (local)", baseUrl: "http://localhost:11434/v1", defaultModel: "llama3.2", needsKey: false },
  { id: "lmstudio", name: "LM Studio", baseUrl: "http://localhost:1234/v1", defaultModel: "local-model", needsKey: false },
];

export function createProvider(id: string, apiKey: string, model?: string, baseUrl?: string): LLMProvider {
  if (id === "mock") {
    // reuse MockProvider from index by dynamic import not possible; return a minimal mock
    return new (class {
      id = "mock"; name = "Mock"; capabilities = { vision: false, tools: false, json: true, contextWindow: 8192 };
      async listModels() { return ["mock-1"]; }
      async health() { return true; }
      async *stream(messages: ChatMessage[]): AsyncGenerator<StreamEvent> {
        const last = messages[messages.length - 1]?.content ?? "";
        const reply = `Echo: ${last}`;
        for (const ch of reply) { await new Promise((r) => setTimeout(r, 15)); yield { type: "token", data: ch }; }
        yield { type: "done" };
      }
    })();
  }
  const info = PROVIDERS.find((p) => p.id === id) ?? PROVIDERS[0]!;
  const base = baseUrl || info.baseUrl;
  const m = model || info.defaultModel;
  return new OpenAICompatProvider(info.id, info.name, base, apiKey, m);
}

export function providerInfo(id: string) { return PROVIDERS.find((p) => p.id === id); }