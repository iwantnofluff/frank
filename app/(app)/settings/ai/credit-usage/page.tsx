import { ComingSoon } from "@/components/settings/ComingSoon";

export default function CreditUsagePage() {
  return (
    <ComingSoon
      title="Credit Usage"
      description="How much of your monthly AI allowance has been used."
      what={[
        "This month's AI requests against your plan's limit, and when it resets.",
        "A day-by-day chart of usage through the month.",
        "Who and what used it: drafting, checks and comment sorting.",
      ]}
    />
  );
}
