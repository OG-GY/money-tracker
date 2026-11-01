"use client";

import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** Selectable pill used by pickers. Min 40px tall for touch. */
export function Chip({ selected, className, ...props }: ComponentProps<"button"> & { selected?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        "inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors",
        selected
          ? "border-primary bg-primary text-primary-foreground"
          : "bg-background text-foreground hover:bg-muted active:bg-muted",
        className,
      )}
      {...props}
    />
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: readonly { value: T; label: string }[];
  className?: string;
}) {
  return (
    <div role="radiogroup" className={cn("grid auto-cols-fr grid-flow-col gap-1 rounded-xl bg-muted p-1", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "h-9 rounded-lg text-sm font-medium transition-colors",
            value === o.value ? "bg-background text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
