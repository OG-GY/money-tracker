import { buildSystemPrompt, buildUserPrompt } from "./prompt";
import { DRAFT_ACTIONS, ProviderError, parseResultSchema, type ParseContext, type Parser } from "./types";

const nullableString = { type: "STRING", nullable: true };

// Gemini's structured-output schema (OpenAPI subset). zod re-validates anyway.
const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    drafts: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          action: { type: "STRING", enum: [...DRAFT_ACTIONS] },
          amount: { type: "INTEGER", nullable: true },
          date: nullableString,
          from: nullableString,
          to: nullableString,
          category: nullableString,
          merchant: nullableString,
          venture: nullableString,
          for_whom: { type: "STRING", enum: ["self", "gift", "family", "household", "other"] },
          need_want: { type: "STRING", enum: ["need", "want"], nullable: true },
          due_date: nullableString,
          note: nullableString,
          confidence: { type: "NUMBER" },
          unknown_names: { type: "ARRAY", items: { type: "STRING" } },
        },
        required: ["action", "amount", "date", "from", "to", "confidence", "unknown_names"],
      },
    },
  },
  required: ["drafts"],
};

export const geminiParser: Parser = {
  name: "gemini",
  async parseTransactions(text: string, context: ParseContext) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new ProviderError("gemini", "GEMINI_API_KEY is not set");
    const model = process.env.GEMINI_MODEL ?? "gemini-flash-latest";

    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: buildSystemPrompt() }] },
        contents: [{ role: "user", parts: [{ text: buildUserPrompt(text, context) }] }],
        generationConfig: {
          temperature: 0,
          responseMimeType: "application/json",
          responseSchema: RESPONSE_SCHEMA,
        },
      }),
      signal: AbortSignal.timeout(25_000),
    });
    if (!res.ok) throw new ProviderError("gemini", await res.text(), res.status);
    const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const content = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    return parseResultSchema.parse(JSON.parse(content)).drafts;
  },
};
