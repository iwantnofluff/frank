import { BillingPage } from "@/components/settings/BillingPage";

export default function InvoicesPage() {
  return (
    <BillingPage
      title="Invoices"
      description="Every invoice for your workspace."
      portalLabel="Invoices"
      portalNote="Kept by Paddle, who takes Frank's payments. Download any of them there."
    />
  );
}
