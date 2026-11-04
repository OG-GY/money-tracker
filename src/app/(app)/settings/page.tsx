import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { AutoConfirmToggle } from "@/components/voice/auto-confirm-toggle";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { ThemePicker } from "./theme-picker";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" />
      <div className="flex max-w-2xl flex-col gap-4 px-4 md:px-8">
        <section className="rounded-2xl border bg-card p-5">
          <h2 className="font-medium">Appearance</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">Dark is the default.</p>
          <ThemePicker />
        </section>

        <section className="rounded-2xl border bg-card p-5">
          <h2 className="font-medium">Voice entry</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Auto-add saves voice entries straight away with an Undo. Anything unclear still comes to you for review.
          </p>
          <AutoConfirmToggle className="mt-4" />
        </section>

        <section className="rounded-2xl border bg-card p-5">
          <h2 className="font-medium">Setup</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">Add accounts with opening balances and income sources.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href="/setup"
              className="inline-flex h-11 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground"
            >
              Open setup
            </Link>
            <Link
              href="/settings/categories"
              className="inline-flex h-11 items-center rounded-lg border px-4 text-sm font-medium hover:bg-muted"
            >
              Categories &amp; groups
            </Link>
            <Link
              href="/accounts/balances"
              className="inline-flex h-11 items-center rounded-lg border px-4 text-sm font-medium hover:bg-muted"
            >
              Set account balances
            </Link>
          </div>
        </section>

        <section className="rounded-2xl border bg-card p-5">
          <h2 className="font-medium">Account</h2>
          <Suspense fallback={<div className="mt-3 h-5 w-48 animate-pulse rounded bg-muted" />}>
            <AccountEmail />
          </Suspense>
          <form action="/auth/signout" method="post" className="mt-4">
            <button
              type="submit"
              className="h-11 rounded-lg bg-destructive/10 px-4 text-sm font-medium text-destructive transition-colors hover:bg-destructive/20"
            >
              Sign out
            </button>
          </form>
        </section>
      </div>
    </>
  );
}

async function AccountEmail() {
  if (!isSupabaseConfigured()) {
    return <p className="mt-1 text-sm text-warning">Supabase is not configured yet.</p>;
  }
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  return <p className="mt-1 text-sm text-muted-foreground">Signed in as {String(data?.claims.email ?? "—")}</p>;
}
