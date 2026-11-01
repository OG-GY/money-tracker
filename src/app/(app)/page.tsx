import { Suspense } from "react";
import { HomeView } from "./home-view";

// "Today" must be computed per visit, so Home streams in behind a skeleton.
export default function HomePage() {
  return (
    <Suspense fallback={<HomeSkeleton />}>
      <HomeView />
    </Suspense>
  );
}

function HomeSkeleton() {
  return (
    <div className="flex flex-col gap-4 px-4 pt-[calc(env(safe-area-inset-top)+1.5rem)] md:px-8 md:pt-8">
      <div className="h-8 w-32 animate-pulse rounded-lg bg-muted" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-2xl bg-muted" />
        ))}
      </div>
    </div>
  );
}
