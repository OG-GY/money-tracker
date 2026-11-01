"use client";

import { motion } from "framer-motion";
import { Mic } from "lucide-react";
import { useVoice } from "@/components/voice/voice-provider";
import { cn } from "@/lib/utils";

type Size = "sm" | "tab" | "hero";

const SIZES: Record<Size, { button: string; icon: string }> = {
  sm: { button: "size-9", icon: "size-4" },
  tab: { button: "size-14", icon: "size-6" },
  hero: { button: "size-24", icon: "size-10" },
};

/** Voice-entry trigger. Flat primary fill only — no gradients. */
export function MicButton({ size = "tab", className }: { size?: Size; className?: string }) {
  const s = SIZES[size];
  const { start, phase } = useVoice();

  return (
    <motion.button
      type="button"
      aria-label="Start voice entry"
      whileTap={{ scale: 0.92 }}
      whileHover={{ scale: 1.04 }}
      transition={{ type: "spring", stiffness: 500, damping: 30 }}
      onClick={start}
      disabled={phase !== "idle"}
      className={cn(
        "relative inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground outline-none focus-visible:ring-4 focus-visible:ring-ring/40",
        s.button,
        className,
      )}
    >
      <Mic className={s.icon} />
    </motion.button>
  );
}
