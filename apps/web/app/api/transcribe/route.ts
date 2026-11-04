import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const apiKey = (formData.get("apiKey") as string) || process.env.GROQ_API_KEY || "";

    if (!file) {
      return NextResponse.json({ error: "No audio file provided" }, { status: 400 });
    }

    if (!apiKey) {
      return NextResponse.json({ error: "No API key configured" }, { status: 401 });
    }

    const groqForm = new FormData();
    groqForm.append("file", file, file.name || "audio.webm");
    groqForm.append("model", "whisper-large-v3-turbo");
    groqForm.append("response_format", "json");
    groqForm.append("language", "en");

    const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: groqForm,
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: err }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json({ text: data.text || "" });
  } catch (e: any) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}