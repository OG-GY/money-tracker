import type { Metadata } from "next";
import { Suspense } from "react";
import { CategoriesManager } from "./categories-manager";

export const metadata: Metadata = { title: "Categories" };

export default function CategoriesPage() {
  return (
    <Suspense>
      <CategoriesManager />
    </Suspense>
  );
}
