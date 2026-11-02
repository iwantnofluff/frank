import { redirect } from "next/navigation";

// Plans moved into Billing (decided directly, 2 Nov 2026); the old
// addresses still lead there.
export default function Page() {
  redirect("/settings/billing/plans");
}
