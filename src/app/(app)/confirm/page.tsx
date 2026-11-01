import type { Metadata } from "next";
import { Suspense } from "react";
import { ConfirmView } from "./confirm-view";

export const metadata: Metadata = { title: "Confirm entries" };

export default function ConfirmPage() {
  return (
    <Suspense>
      <ConfirmView />
    </Suspense>
  );
}
