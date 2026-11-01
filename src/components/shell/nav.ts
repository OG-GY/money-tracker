import {
  ArrowLeftRight,
  BarChart3,
  Briefcase,
  Home,
  Landmark,
  PiggyBank,
  Settings,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon };

export const NAV = {
  home: { href: "/", label: "Home", icon: Home },
  transactions: { href: "/transactions", label: "Transactions", icon: ArrowLeftRight },
  envelopes: { href: "/envelopes", label: "Envelopes", icon: Wallet },
  accounts: { href: "/accounts", label: "Accounts", icon: Landmark },
  people: { href: "/people", label: "People", icon: Users },
  ventures: { href: "/ventures", label: "Ventures", icon: Briefcase },
  savings: { href: "/savings", label: "Savings", icon: PiggyBank },
  analytics: { href: "/analytics", label: "Analytics", icon: BarChart3 },
  settings: { href: "/settings", label: "Settings", icon: Settings },
} satisfies Record<string, NavItem>;

/** Desktop sidebar, top to bottom. */
export const SIDEBAR_ITEMS: NavItem[] = [
  NAV.home,
  NAV.transactions,
  NAV.envelopes,
  NAV.accounts,
  NAV.people,
  NAV.ventures,
  NAV.savings,
  NAV.analytics,
];

/** Mobile tab bar: two items, the mic, two more (the second being "More"). */
export const TAB_ITEMS_LEFT: NavItem[] = [NAV.home, NAV.transactions];
export const TAB_ITEMS_RIGHT: NavItem[] = [NAV.envelopes];

/** Everything behind the mobile "More" sheet. */
export const MORE_ITEMS: NavItem[] = [
  NAV.accounts,
  NAV.people,
  NAV.ventures,
  NAV.savings,
  NAV.analytics,
  NAV.settings,
];

export function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
