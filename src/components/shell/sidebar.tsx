"use client";

import { motion } from "framer-motion";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { Logo } from "@/components/logo";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { NAV, SIDEBAR_ITEMS, isActive, type NavItem } from "./nav";

type SidebarProps = { collapsed: boolean; onToggle: () => void };

/** Active state needs the URL, which streams in on dynamic routes; the fallback renders without it. */
export function Sidebar(props: SidebarProps) {
  return (
    <Suspense fallback={<SidebarView {...props} pathname="" />}>
      <SidebarWithPath {...props} />
    </Suspense>
  );
}

function SidebarWithPath(props: SidebarProps) {
  return <SidebarView {...props} pathname={usePathname()} />;
}

function SidebarView({ collapsed, onToggle, pathname }: SidebarProps & { pathname: string }) {
  return (
    <motion.aside
      initial={false}
      animate={{ width: collapsed ? 72 : 240 }}
      transition={{ type: "spring", stiffness: 400, damping: 40 }}
      className="sticky top-0 hidden h-dvh shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground md:flex"
    >
      <div className="flex h-16 items-center gap-3 overflow-hidden px-4">
        <Logo className="size-9" />
        {!collapsed && <span className="truncate text-base font-semibold tracking-tight">Money Tracker</span>}
      </div>

      <nav aria-label="Main" className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-2">
        {SIDEBAR_ITEMS.map((item) => (
          <SidebarLink key={item.href} item={item} active={isActive(pathname, item.href)} collapsed={collapsed} />
        ))}
      </nav>

      <div className="flex flex-col gap-1 border-t px-3 py-3">
        <SidebarLink item={NAV.settings} active={isActive(pathname, NAV.settings.href)} collapsed={collapsed} />
        <button
          type="button"
          onClick={onToggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="flex h-10 items-center gap-3 rounded-lg px-3 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          {collapsed ? <PanelLeftOpen className="size-5 shrink-0" /> : <PanelLeftClose className="size-5 shrink-0" />}
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </motion.aside>
  );
}

function SidebarLink({ item, active, collapsed }: { item: NavItem; active: boolean; collapsed: boolean }) {
  const link = (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors",
        active
          ? "text-sidebar-primary-foreground"
          : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
      )}
    >
      {active && (
        <motion.span
          layoutId="sidebar-active"
          className="absolute inset-0 rounded-lg bg-sidebar-primary"
          transition={{ type: "spring", stiffness: 500, damping: 40 }}
        />
      )}
      <item.icon className="relative size-5 shrink-0" />
      {!collapsed && <span className="relative truncate">{item.label}</span>}
    </Link>
  );

  if (!collapsed) return link;
  return (
    <Tooltip>
      <TooltipTrigger render={link} />
      <TooltipContent side="right">{item.label}</TooltipContent>
    </Tooltip>
  );
}
