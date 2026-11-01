import type { Metadata } from "next";
import { SetupWizard } from "./setup-wizard";

export const metadata: Metadata = { title: "Setup" };

export default function SetupPage() {
  return <SetupWizard />;
}
