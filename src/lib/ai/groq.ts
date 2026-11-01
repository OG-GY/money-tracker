import { buildSystemPrompt, buildUserPrompt } from "./prompt";
import { ProviderError, parseResultSchema, type ParseContext, type Parser, type Transcriber } from "./types";

const BASE = "https://api.groq.com/openai/v1";

function key() {
  const k = process.env.GROQ_API_KEY;
  if (!k) throw new ProviderError("groq", "GROQ_API_KEY is not set");
  return k;
}

export const groqTranscriber: Transcriber = {
  name: "groq-whisper",
  async transcribe(audio, hint) {
    const form = new FormData();
    const ext = audio.type.includes("mp4") ? "m4a" : audio.type.includes("ogg") ? "ogg" : "webm";
    form.append("file", audio, `voice.${ext}`);
    form.append("model", process.env.GROQ_STT_MODEL ?? "whisper-large-v3");
    form.append("response_format", "json");
    form.append("temperature", "0");
    if (hint) form.append("prompt", hint);

    const res = await fetch(`${BASE}/audio/transcriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key()}` },
      body: form,
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new ProviderError("groq-whisper", await res.text(), res.status);
    const data = (await res.json()) as { text?: string };
    return (data.text ?? "").trim();
  },
};

export const groqParser: Parser = {
  name: "groq-gpt-oss",
  async parseTransactions(text: string, context: ParseContext) {
    const res = await fetch(`${BASE}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key()}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.GROQ_PARSE_MODEL ?? "openai/gpt-oss-120b",
        temperature: 0,
        reasoning_effort: "low",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: buildSystemPrompt() },
          { role: "user", content: buildUserPrompt(text, context) },
        ],
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new ProviderError("groq-gpt-oss", await res.text(), res.status);
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = data.choices?.[0]?.message?.content ?? "";
    return parseResultSchema.parse(JSON.parse(content)).drafts;
  },
};
