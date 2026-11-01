import { geminiParser } from "./gemini";
import { groqParser, groqTranscriber } from "./groq";
import type { ParseContext, ParsedDraft, Parser, Transcriber } from "./types";

// Provider order lives here; UI and routes only see these two functions (SPEC §4).
const TRANSCRIBER: Transcriber = groqTranscriber;
const PARSERS: Parser[] = [geminiParser, groqParser];

/** Whisper with one retry (SPEC §4 step 3). The client falls back to Web Speech after this. */
export async function transcribe(audio: Blob, hint?: string): Promise<string> {
  try {
    return await TRANSCRIBER.transcribe(audio, hint);
  } catch (first) {
    console.warn("[transcribe] retrying after:", (first as Error).message);
    return TRANSCRIBER.transcribe(audio, hint);
  }
}

/** Gemini first; Groq on any error, rate limit or invalid JSON. */
export async function parseTransactions(
  text: string,
  context: ParseContext,
): Promise<{ drafts: ParsedDraft[]; provider: string }> {
  const errors: string[] = [];
  for (const parser of PARSERS) {
    try {
      return { drafts: await parser.parseTransactions(text, context), provider: parser.name };
    } catch (e) {
      errors.push((e as Error).message.slice(0, 300));
      console.warn(`[parse] ${parser.name} failed:`, (e as Error).message.slice(0, 300));
    }
  }
  throw new Error(`All parsers failed. ${errors.join(" | ")}`);
}

export type { ParseContext, ParsedDraft } from "./types";
