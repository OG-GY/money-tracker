import type { Metadata } from "next";
import { VenturesView } from "./ventures-view";

export const metadata: Metadata = { title: "Ventures" };

export default function VenturesPage() {
  return <VenturesView />;
}
