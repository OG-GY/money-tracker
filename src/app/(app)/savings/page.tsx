import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";

export const metadata: Metadata = { title: "Savings" };

export default function SavingsPage() {
  return <ComingSoon section="savings" phase={6} summary="Mahana balance updates, profit tracking and growth projections." />;
}
