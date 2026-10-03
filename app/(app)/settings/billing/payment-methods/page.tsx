import { ComingSoon } from "@/components/settings/ComingSoon";

export default function PaymentMethodsPage() {
  return (
    <ComingSoon
      title="Payment Methods"
      description="How your agency pays for Frank."
      what={["The card on file.", "Changing the card."]}
    />
  );
}
