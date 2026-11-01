import { cn } from "@/lib/utils";

// Flat mark: a blue rounded square with a white rupee glyph.
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden className={cn("shrink-0", className)}>
      <rect width="64" height="64" rx="16" fill="var(--brand)" />
      <path
        d="M22 18h20M22 27h20M22 18h7a9 9 0 0 1 0 18h-7l17 14"
        fill="none"
        stroke="#fff"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
