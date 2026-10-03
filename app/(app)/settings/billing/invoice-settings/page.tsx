import { ComingSoon } from "@/components/settings/ComingSoon";

export default function InvoiceSettingsPage() {
  return (
    <ComingSoon
      title="Invoice Settings"
      description="The details printed on your invoices."
      what={["The invoice contact's name.", "Your company name, address and country.", "Your GST or VAT number."]}
    />
  );
}
