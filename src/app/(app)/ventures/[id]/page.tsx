import { Suspense } from "react";
import { VentureDetail } from "./venture-detail";

export default function VenturePage() {
  return (
    <Suspense>
      <VentureDetail />
    </Suspense>
  );
}
