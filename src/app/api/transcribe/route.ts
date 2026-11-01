import { NextResponse, type NextRequest } from "next/server";
import { transcribe } from "@/lib/ai";
import { loadParseContext } from "@/lib/ai/context";
import { transcriptionHint } from "@/lib/ai/prompt";
import { requireUser } from "@/lib/supabase/require-user";

const MAX_BYTES = 8 * 1024 * 1024; // ~60s of compressed mono audio is far below this

// POST multipart { audio } → { text }. The audio is never stored (SPEC §10).
export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const form = await request.formData().catch(() => null);
  const audio = form?.get("audio");
  if (!(audio instanceof Blob) || audio.size === 0) {
    return NextResponse.json({ error: "No audio received" }, { status: 400 });
  }
  if (audio.size > MAX_BYTES) {
    return NextResponse.json({ error: "Recording is too long" }, { status: 413 });
  }

  try {
    const context = await loadParseContext(auth.supabase).catch(() => null);
    const text = await transcribe(audio, context ? transcriptionHint(context) : undefined);
    return NextResponse.json({ text });
  } catch (e) {
    console.error("[api/transcribe]", (e as Error).message);
    return NextResponse.json({ error: "Transcription failed" }, { status: 502 });
  }
}
