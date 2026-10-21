import type { Metadata } from "next";
import { Onest, Urbanist } from "next/font/google";
import localFont from "next/font/local";
import { Providers } from "./providers";
import "./globals.css";

const urbanist = Urbanist({
  variable: "--font-urbanist",
  subsets: ["latin"],
});

// The website's type, for the sign-in screens (direct instruction, 21 Oct
// 2026): Sentient Light (Fontshare, free for commercial use, served with
// the app) and Onest. Not preloaded: only those screens use them.
const onest = Onest({ variable: "--font-onest", subsets: ["latin"], weight: ["400", "500"], preload: false });
const sentient = localFont({ src: "./welcome/fonts/Sentient-Light.woff2", variable: "--font-sentient", weight: "300", preload: false });

export const metadata: Metadata = {
  title: "Frank",
  description: "Content planning, review and approval for agencies.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${urbanist.variable} ${onest.variable} ${sentient.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
