import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { parseTransactions } from "@/lib/ai";
import { loadParseContext } from "@/lib/ai/context";
import { requireUser } from "@/lib/supabase/require-user";

const body = z.object({ text: z.string().trim().min(1).max(2000) });

// POST { text } → { drafts, provider }. Context comes from the user's own data,
// never from the client.
export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Send some text to parse" }, { status: 400 });

  try {
    const context = await loadParseContext(auth.supabase);
    const result = await parseTransactions(parsed.data.text, context);
    return NextResponse.json(result);
  } catch (e) {
    console.error("[api/parse]", (e as Error).message);
    return NextResponse.json({ error: "Couldn't understand that right now. Try again or add it manually." }, { status: 502 });
  }
}
