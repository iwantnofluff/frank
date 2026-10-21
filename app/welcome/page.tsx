import type { Metadata } from "next";
import { Welcome } from "./Welcome";

export const metadata: Metadata = {
  title: "Frank",
  description: "Content review and approval for agencies.",
};

// Frank's front door (decided directly, phase42; app.beingfrank.app from
// 21 Oct 2026): where an agency signs itself up, and where anyone finds
// their way to their agency's own address to sign in. The proxy shows this
// for every path there. ?signin opens on Sign in.
export default async function WelcomePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  return (
    <div className="authwrap scroll">
      <Welcome startOnSignIn={"signin" in params} />
      <p className="authfoot">
        <a href="/privacy">Privacy policy</a>
      </p>
    </div>
  );
}
