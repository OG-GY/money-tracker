import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { todayInKarachi } from "@/lib/format";
import type { ParseContext } from "./types";

/** The user's own names, read through RLS, for the parser and Whisper hint. */
export async function loadParseContext(supabase: SupabaseClient): Promise<ParseContext> {
  const [accounts, categories, envelopes, ventures] = await Promise.all([
    supabase.from("accounts").select("name, kind, subtype, on_budget, meta").eq("archived", false),
    supabase.from("categories").select("id, parent_id, name, is_system").eq("archived", false).order("sort_order"),
    supabase.from("envelopes").select("name, kind").eq("archived", false).eq("kind", "personal").order("sort_order"),
    supabase.from("ventures").select("name, status").eq("archived", false).neq("status", "closed"),
  ]);
  const err = accounts.error ?? categories.error ?? envelopes.error ?? ventures.error;
  if (err) throw new Error(err.message);

  const acc = accounts.data ?? [];
  const cats = categories.data ?? [];
  const byId = new Map(cats.map((c) => [c.id, c]));

  return {
    today: todayInKarachi(),
    assets: acc
      .filter((a) => a.kind === "asset")
      .map((a) => ({ name: a.name, subtype: a.subtype, on_budget: a.on_budget })),
    people: acc.filter((a) => a.kind === "person").map((a) => a.name),
    sources: acc.filter((a) => a.kind === "source" && !(a.meta as { system?: string })?.system).map((a) => a.name),
    categories: cats
      .filter((c) => !c.is_system || c.name === "Loan written off")
      .map((c) => (c.parent_id ? `${byId.get(c.parent_id)?.name} > ${c.name}` : c.name)),
    envelopes: (envelopes.data ?? []).map((e) => e.name),
    ventures: (ventures.data ?? []).map((v) => v.name),
  };
}
