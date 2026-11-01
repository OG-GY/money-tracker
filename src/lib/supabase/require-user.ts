import "server-only";
import { NextResponse } from "next/server";
import { createClient } from "./server";

/**
 * Route-handler guard: re-verifies the session close to the data (the proxy
 * alone is not authorization). Returns the client, or a 401 response.
 */
export async function requireUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const email = String(data?.claims?.email ?? "").toLowerCase();
  const allowed = process.env.ALLOWED_EMAIL?.toLowerCase();

  if (!data?.claims || (allowed && email !== allowed)) {
    return { error: NextResponse.json({ error: "Not signed in" }, { status: 401 }) } as const;
  }
  return { supabase, userId: String(data.claims.sub) } as const;
}
