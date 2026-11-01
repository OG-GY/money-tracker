import type { Metadata } from "next";
import { Suspense } from "react";
import { PeopleView } from "./people-view";

export const metadata: Metadata = { title: "People" };

// Overdue depends on today's date, so the list streams in per visit.
export default function PeoplePage() {
  return (
    <Suspense>
      <PeopleView />
    </Suspense>
  );
}
