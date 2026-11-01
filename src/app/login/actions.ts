"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type LoginState =
  | { step: "email"; error?: string }
  | { step: "code"; email: string; error?: string };

function safeNext(next: FormDataEntryValue | null) {
  const value = typeof next === "string" ? next : "";
  // Only allow same-site relative paths.
  return value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

async function siteOrigin() {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

export async function sendLoginEmail(_: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return { step: "email", error: "Enter a valid email address." };
  }

  // Single-user app: only the owner's address may sign in.
  const allowed = process.env.ALLOWED_EMAIL?.toLowerCase();
  if (allowed && email !== allowed) {
    return { step: "email", error: "This email is not allowed to sign in." };
  }

  const next = safeNext(formData.get("next"));
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${await siteOrigin()}/auth/confirm?next=${encodeURIComponent(next)}`,
    },
  });

  if (error) return { step: "email", error: error.message };
  return { step: "code", email };
}

export async function verifyLoginCode(_: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "");
  const token = String(formData.get("token") ?? "").trim();

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
  if (error) return { step: "code", email, error: "That code didn't work. Check it or request a new one." };

  redirect(safeNext(formData.get("next")));
}
