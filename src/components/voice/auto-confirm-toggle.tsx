"use client";

import { Switch } from "@/components/ui/switch";
import { setAutoConfirm, useAutoConfirm } from "@/lib/settings";
import { cn } from "@/lib/utils";

/** Quick toggle next to the mic (SPEC §4 step 7). */
export function AutoConfirmToggle({ className, compact }: { className?: string; compact?: boolean }) {
  const on = useAutoConfirm();
  return (
    <label className={cn("flex cursor-pointer items-center gap-2 text-sm", className)}>
      <Switch checked={on} onCheckedChange={setAutoConfirm} aria-label="Auto-add voice entries" />
      <span className={cn(on ? "text-foreground" : "text-muted-foreground")}>{compact ? "Auto-add" : on ? "Auto-add on" : "Review before adding"}</span>
    </label>
  );
}
