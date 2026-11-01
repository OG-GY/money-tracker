import { Suspense } from "react";
import { AccountDetail } from "./account-detail";

export default function AccountPage() {
  return (
    <Suspense>
      <AccountDetail />
    </Suspense>
  );
}
