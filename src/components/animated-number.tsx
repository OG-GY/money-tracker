"use client";

import { animate, useMotionValue, useTransform, motion, useReducedMotion } from "framer-motion";
import { useEffect } from "react";
import { formatPKR } from "@/lib/format";

/** Counts up to `value` and renders it as PKR. */
export function AnimatedNumber({ value, className }: { value: number; className?: string }) {
  const reduce = useReducedMotion();
  const mv = useMotionValue(reduce ? value : 0);
  const text = useTransform(mv, (v) => formatPKR(v));

  useEffect(() => {
    if (reduce) {
      mv.set(value);
      return;
    }
    const controls = animate(mv, value, { duration: 0.8, ease: [0.22, 1, 0.36, 1] });
    return () => controls.stop();
  }, [mv, value, reduce]);

  return <motion.span className={className}>{text}</motion.span>;
}
