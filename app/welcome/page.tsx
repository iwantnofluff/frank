import type { Metadata } from "next";
import { Onest } from "next/font/google";
import localFont from "next/font/local";
import { Welcome } from "./Welcome";

export const metadata: Metadata = {
  title: "Frank",
  description: "Content review and approval for agencies.",
};

// The website's type (direct instruction, 21 Oct 2026, from its Framer
// design): Sentient Light for the heading (Fontshare, free for commercial
// use, served with the app) and Onest for everything else.
const onest = Onest({ variable: "--font-onest", subsets: ["latin"], weight: ["400", "500"] });
const sentient = localFont({ src: "./fonts/Sentient-Light.woff2", variable: "--font-sentient", weight: "300" });

// Frank's front door (decided directly, phase42; app.beingfrank.app from
// 21 Oct 2026): where an agency signs itself up, and where anyone finds
// their way to their agency's own address to sign in. The proxy shows this
// for every path there. ?signin opens on Sign in. Dressed as the website
// (direct instruction): its header, and its Sign Up page's card.
export default async function WelcomePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  return (
    <div className={`fdoor ${onest.variable} ${sentient.variable}`}>
      <Welcome startOnSignIn={"signin" in params} />
    </div>
  );
}
