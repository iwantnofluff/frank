import type { Metadata } from "next";
import { Welcome } from "./Welcome";

export const metadata: Metadata = {
  title: "Frank",
  description: "Content review and approval for agencies.",
};

// beingfrank.app (decided directly, phase42): where an agency signs itself
// up, and where anyone finds their way to their agency's own address to
// sign in. The proxy shows this for every path on the bare domain.
export default function WelcomePage() {
  return (
    <div className="authwrap scroll">
      <Welcome />
    </div>
  );
}
