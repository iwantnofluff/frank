import type { Metadata } from "next";
import { Urbanist } from "next/font/google";
import { Providers } from "./providers";
import "./globals.css";

const urbanist = Urbanist({
  variable: "--font-urbanist",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Frank",
  description: "Content planning, review and approval for agencies.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={urbanist.variable}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
