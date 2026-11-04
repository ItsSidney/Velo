import { z } from "zod";

export type Role = "system" | "user" | "assistant" | "tool";

export interface ChatMessage {
  role: Role;
  content: string;
}

export interface StreamEvent {
  type: "token" | "reasoning" | "tool_call" | "usage" | "error" | "done";
  data?: any;
}

export interface LLMProvider {
  id: string;
  name: string;
  listModels(): Promise<string[]>;
  stream(messages: ChatMessage[], options?: { model?: string; signal?: AbortSignal }): AsyncGenerator<StreamEvent>;
  capabilities: { vision: boolean; tools: boolean; json: boolean; contextWindow: number };
  health(): Promise<boolean>;
}

export * from "./providers";

export class MockProvider implements LLMProvider {
  id = "mock";
  name = "Mock";
  capabilities = { vision: false, tools: false, json: true, contextWindow: 8192 };
  async listModels() { return ["mock-1"]; }
  async health() { return true; }
  async *stream(messages: ChatMessage[]): AsyncGenerator<StreamEvent> {
    const last = messages[messages.length - 1]?.content ?? "";
    const reply = `Echo: ${last}`;
    for (const ch of reply) {
      await new Promise((r) => setTimeout(r, 20));
      yield { type: "token", data: ch };
    }
    yield { type: "done" };
  }
}