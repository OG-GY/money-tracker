"use client";

import type { ReactNode } from "react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useIsDesktop } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";

/**
 * Forms and edits (SPEC §8.2): a bottom sheet on phones, a right-side panel on desktop.
 */
export function ResponsivePanel({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const desktop = useIsDesktop();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={desktop ? "right" : "bottom"}
        className={cn(
          "gap-0 p-0",
          desktop ? "w-full sm:max-w-md" : "max-h-[92dvh] rounded-t-3xl",
        )}
      >
        {!desktop && <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-muted-foreground/30" />}
        <SheetHeader className="shrink-0 pr-12">
          <SheetTitle className="text-lg">{title}</SheetTitle>
          {description && <SheetDescription>{description}</SheetDescription>}
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">{children}</div>
        {footer && <div className="shrink-0 border-t bg-popover px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">{footer}</div>}
      </SheetContent>
    </Sheet>
  );
}
