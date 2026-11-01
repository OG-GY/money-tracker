import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/supabase/env";

// Daily Vercel Cron (vercel.json). A real database query keeps the free
// Supabase project from pausing after a week of inactivity.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
  const { data, error } = await supabase.rpc("keepalive");

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, at: data });
}
