"use client";

import { motion } from "framer-motion";
import { MoreHorizontal } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { MicButton } from "./mic-button";
import { MORE_ITEMS, TAB_ITEMS_LEFT, TAB_ITEMS_RIGHT, isActive, type NavItem } from "./nav";

/** Active state needs the URL, which streams in on dynamic routes; the fallback renders without it. */
export function BottomTabs() {
  return (
    <Suspense fallback={<BottomTabsView pathname="" />}>
      <BottomTabsWithPath />
    </Suspense>
  );
}

function BottomTabsWithPath() {
  return <BottomTabsView pathname={usePathname()} />;
}

function BottomTabsView({ pathname }: { pathname: string }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const moreActive = MORE_ITEMS.some((item) => isActive(pathname, item.href));

  return (
    <>
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-40 border-t bg-background pb-safe md:hidden"
      >
        <div className="mx-auto grid h-tabbar max-w-lg grid-cols-5 items-center">
          {TAB_ITEMS_LEFT.map((item) => (
            <TabLink key={item.href} item={item} active={isActive(pathname, item.href)} />
          ))}
          <div className="flex justify-center">
            <MicButton size="tab" className="-mt-6 ring-4 ring-background" />
          </div>
          {TAB_ITEMS_RIGHT.map((item) => (
            <TabLink key={item.href} item={item} active={isActive(pathname, item.href)} />
          ))}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            className={cn(
              "relative flex h-full min-h-11 flex-col items-center justify-center gap-1 text-[11px] font-medium",
              moreActive ? "text-primary" : "text-muted-foreground",
            )}
          >
            {moreActive && <ActiveDot />}
            <MoreHorizontal className="size-5" />
            More
          </button>
        </div>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="rounded-t-3xl pb-safe md:hidden">
          <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-muted-foreground/30" />
          <SheetHeader className="pb-0">
            <SheetTitle>More</SheetTitle>
          </SheetHeader>
          <div className="grid grid-cols-3 gap-2 px-4 pb-6">
            {MORE_ITEMS.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMoreOpen(false)}
                  className={cn(
                    "flex min-h-20 flex-col items-center justify-center gap-2 rounded-2xl text-sm font-medium transition-colors",
                    active ? "bg-primary text-primary-foreground" : "bg-muted text-foreground active:bg-accent",
                  )}
                >
                  <item.icon className="size-5" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

function TabLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      className={cn(
        "relative flex h-full min-h-11 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors",
        active ? "text-primary" : "text-muted-foreground",
      )}
    >
      {active && <ActiveDot />}
      <item.icon className="size-5" />
      {item.label}
    </Link>
  );
}

function ActiveDot() {
  return (
    <motion.span
      layoutId="tab-indicator"
      className="absolute top-0 h-0.5 w-8 rounded-full bg-primary"
      transition={{ type: "spring", stiffness: 500, damping: 35 }}
    />
  );
}
