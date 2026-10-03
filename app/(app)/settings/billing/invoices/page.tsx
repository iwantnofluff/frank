import { ComingSoon } from "@/components/settings/ComingSoon";

export default function InvoicesPage() {
  return (
    <ComingSoon
      title="Invoices"
      description="Every invoice for your agency."
      what={["Each invoice's date, amount and what it was for.", "Whether it's paid.", "A download of each one."]}
    />
  );
}
