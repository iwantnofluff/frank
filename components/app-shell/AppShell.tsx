import Link from "next/link";
import { NavRail } from "./NavRail";
import { Topbar } from "./Topbar";
import { AgencyTheme } from "./AgencyTheme";
import { ReadOnlyBanner } from "./ReadOnlyBanner";
import { ViewTransition } from "./ViewTransition";
import { BRAND } from "@/lib/brand";

export function AppShell({
  children,
  userInitials,
  userName,
  userEmail,
}: {
  children: React.ReactNode;
  userInitials: string;
  userName: string | null;
  userEmail: string;
}) {
  return (
    <div className="app">
      <AgencyTheme />
      {/* Frank's logo in the top left corner (direct instruction), over the
          rail's top and into the header; it goes to the clients list. */}
      <Link href="/dashboard" className="corner-logo" aria-label="Frank" title="Go to all clients">
        {/* eslint-disable-next-line @next/next/no-img-element -- a static SVG */}
        <img src={BRAND.headerReversed} alt="" />
      </Link>
      <NavRail />
      <div className="main">
        <Topbar userInitials={userInitials} userName={userName} userEmail={userEmail} />
        <ReadOnlyBanner />
        <ViewTransition>{children}</ViewTransition>
      </div>
    </div>
  );
}
