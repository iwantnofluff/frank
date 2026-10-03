import { ComingSoon } from "@/components/settings/ComingSoon";

export default function ApisPage() {
  return (
    <ComingSoon
      title="APIs"
      description="Accounts outside Frank that your agency has connected."
      what={[
        "Connect Meta, Google and other accounts your agency publishes to.",
        "See which are connected, by whom, and when.",
        "Disconnect an account at any time.",
      ]}
    />
  );
}
