import type { Metadata } from "next";
import { Suspense } from "react";
import { SetBalances } from "./set-balances";

export const metadata: Metadata = { title: "Set balances" };

export default function SetBalancesPage() {
  return (
    <Suspense>
      <SetBalances />
    </Suspense>
  );
}
