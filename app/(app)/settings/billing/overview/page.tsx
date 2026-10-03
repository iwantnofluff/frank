import { ComingSoon } from "@/components/settings/ComingSoon";

export default function BillingOverviewPage() {
  return (
    <ComingSoon
      title="Billing Overview"
      description="Your plan, what it includes, and what's next to pay."
      what={["Your plan and its limits.", "Your next payment and when it's due.", "Changing or cancelling your plan."]}
    />
  );
}
