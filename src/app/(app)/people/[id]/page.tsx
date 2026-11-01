import { Suspense } from "react";
import { PersonDetail } from "./person-detail";

export default function PersonPage() {
  return (
    <Suspense>
      <PersonDetail />
    </Suspense>
  );
}
