import type { Metadata } from "next";
import { Suspense } from "react";
import { Logo } from "@/components/logo";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 pt-safe pb-safe">
      <div className="w-full max-w-sm">
        <div className="mb-10 flex flex-col items-center gap-4 text-center">
          <Logo className="size-14" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Money Tracker</h1>
            <p className="mt-1 text-sm text-muted-foreground">Sign in with your email</p>
          </div>
        </div>
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
