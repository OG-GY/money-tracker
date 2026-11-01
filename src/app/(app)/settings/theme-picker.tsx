"use client";

import { motion } from "framer-motion";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";

const OPTIONS = [
  { value: "dark", label: "Dark", icon: Moon },
  { value: "light", label: "Light", icon: Sun },
  { value: "system", label: "System", icon: Monitor },
] as const;

const subscribe = () => () => {};

export function ThemePicker() {
  const { theme, setTheme } = useTheme();
  // The stored theme is only known on the client.
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);

  return (
    <div role="radiogroup" aria-label="Theme" className="mt-4 grid grid-cols-3 gap-2">
      {OPTIONS.map((o) => {
        const active = mounted && theme === o.value;
        return (
          <button
            key={o.value}
            role="radio"
            aria-checked={active}
            onClick={() => setTheme(o.value)}
            className={cn(
              "relative flex h-11 items-center justify-center gap-2 rounded-lg border text-sm font-medium transition-colors",
              active ? "border-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {active && (
              <motion.span
                layoutId="theme-active"
                className="absolute inset-0 rounded-lg bg-primary"
                transition={{ type: "spring", stiffness: 500, damping: 40 }}
              />
            )}
            <o.icon className="relative size-4" />
            <span className="relative">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
