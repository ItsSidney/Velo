import { NextRequest } from "next/server";
import { createProvider } from "@velo/core";

const SYSTEM: Record<string, string> = {
  Chat: "You are Velo, a friendly and conversational AI assistant created by Eldrick Sidney and Jeremy Kinoti. Talk naturally, like a helpful friend. Use markdown formatting when it helps readability. Be warm, curious, and genuinely helpful. Never claim to be made by OpenAI or any other company. When the user asks about a place or wants a map, output a raw Google Maps URL like https://www.google.com/maps?q=QUERY (not a markdown link) — Velo renders it as an embedded interactive map. Similarly, output raw youtube.com/watch?v=ID or open.spotify.com/... URLs to get embedded players. When asked to show images, use real Unsplash URLs (https://images.unsplash.com/photo-...) that actually exist.",
  Coder: "You are Velo in Coder mode, created by Eldrick Sidney and Jeremy Kinoti. You're a senior software engineer who explains things clearly and conversationally. Produce correct, idiomatic code. Use fenced code blocks with language tags (use ```python for plotting code, which can be run in-browser to render graphs; use ```html for web pages, which can be previewed live). Explain briefly and naturally. Never claim to be made by OpenAI or any other company. For places/maps output raw https://www.google.com/maps?q=QUERY URLs.",
};

export async function POST(req: NextRequest) {
  const body = await req.json();
  const messages = body.messages ?? [];
  const mode = body.mode ?? "Chat";
  const providerId = (body.apiKey ? (body.provider ?? "groq") : "groq");
  const model = body.model;
  const baseUrl = body.baseUrl;
  const apiKey = body.apiKey || process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY || "";
  const sys = SYSTEM[mode] ?? SYSTEM.Chat;
  const clean = messages.map((m: any) => ({ role: m.role, content: m.content }));
  const full = [{ role: "system", content: sys }, ...clean];
  const provider = createProvider(providerId, apiKey, model, baseUrl);
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const ev of provider.stream(full as any)) {
          if (ev.type === "token") controller.enqueue(encoder.encode(`data: ${JSON.stringify({ token: ev.data })}\n\n`));
          if (ev.type === "error") controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: ev.data })}\n\n`));
          if (ev.type === "done") controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        }
      } catch (e: any) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: String(e) })}\n\n`));
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      }
      controller.close();
    }
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive" } });
}