import { BillingPage } from "@/components/settings/BillingPage";

export default function BillingOverviewPage() {
  return (
    <BillingPage
      overview
      title="Billing Overview"
      description="Your plan, and what's next to pay."
      portalLabel="Billing details"
      portalNote="Invoices, the card on file, and cancelling, at Paddle"
    />
  );
}
