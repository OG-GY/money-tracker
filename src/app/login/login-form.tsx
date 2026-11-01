"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Loader2, Mail } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Label } from "@/components/ui/label";
import { sendLoginEmail, verifyLoginCode, type LoginState } from "./actions";

const OTP_LENGTH = Number(process.env.NEXT_PUBLIC_OTP_LENGTH ?? 6);

const URL_ERRORS: Record<string, string> = {
  "link-expired": "That sign-in link has expired or was already used. Request a new one.",
  "not-allowed": "This account is not allowed to use this app.",
};

export function LoginForm() {
  const params = useSearchParams();
  const next = params.get("next") ?? "/";
  const urlError = URL_ERRORS[params.get("error") ?? ""];

  const [sendState, sendAction, sending] = useActionState<LoginState, FormData>(sendLoginEmail, {
    step: "email",
  });
  const [verifyState, verifyAction, verifying] = useActionState<LoginState, FormData>(
    verifyLoginCode,
    { step: "email" },
  );
  const [code, setCode] = useState("");
  const [editingEmail, setEditingEmail] = useState(false);

  const onCodeStep = sendState.step === "code" && !editingEmail;
  const email = sendState.step === "code" ? sendState.email : "";
  const error = onCodeStep ? verifyState.error : (sendState.error ?? urlError);

  return (
    <AnimatePresence mode="wait" initial={false}>
      {onCodeStep ? (
        <motion.form
          key="code"
          action={verifyAction}
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -24 }}
          transition={{ duration: 0.2 }}
          className="flex flex-col gap-5"
        >
          <input type="hidden" name="email" value={email} />
          <input type="hidden" name="next" value={next} />
          <input type="hidden" name="token" value={code} />

          <div className="flex items-start gap-3 rounded-xl bg-muted p-4 text-sm">
            <Mail className="mt-0.5 size-4 shrink-0 text-primary" />
            <p>
              We sent a sign-in link to <span className="font-medium">{email}</span>. Tap the link, or
              enter the code from the email here (best when using the installed app).
            </p>
          </div>

          <div className="flex flex-col items-center gap-2">
            <InputOTP
              maxLength={OTP_LENGTH}
              value={code}
              onChange={setCode}
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
            >
              <InputOTPGroup>
                {Array.from({ length: OTP_LENGTH }, (_, i) => (
                  <InputOTPSlot key={i} index={i} className="size-11 text-lg" />
                ))}
              </InputOTPGroup>
            </InputOTP>
          </div>

          {error && <p className="text-center text-sm text-expense">{error}</p>}

          <Button type="submit" size="lg" className="h-12 text-base" disabled={verifying || code.length < OTP_LENGTH}>
            {verifying && <Loader2 className="animate-spin" />}
            Verify code
          </Button>
          <Button type="button" variant="ghost" onClick={() => setEditingEmail(true)}>
            <ArrowLeft /> Use a different email
          </Button>
        </motion.form>
      ) : (
        <motion.form
          key="email"
          action={(formData) => {
            setEditingEmail(false);
            setCode("");
            sendAction(formData);
          }}
          initial={{ opacity: 0, x: -24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 24 }}
          transition={{ duration: 0.2 }}
          className="flex flex-col gap-5"
        >
          <input type="hidden" name="next" value={next} />
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="you@example.com"
              defaultValue={email}
              required
              className="h-12 text-base"
            />
          </div>

          {error && <p className="text-sm text-expense">{error}</p>}

          <Button type="submit" size="lg" className="h-12 text-base" disabled={sending}>
            {sending && <Loader2 className="animate-spin" />}
            Send sign-in link
          </Button>
        </motion.form>
      )}
    </AnimatePresence>
  );
}
