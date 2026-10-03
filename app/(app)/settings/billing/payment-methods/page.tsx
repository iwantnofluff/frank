import { BillingPage } from "@/components/settings/BillingPage";

export default function PaymentMethodsPage() {
  return (
    <BillingPage
      title="Payment Methods"
      description="How your agency pays for Frank."
      portalLabel="Card on file"
      portalNote="Kept by Paddle, who takes Frank's payments. Change it there."
    />
  );
}
