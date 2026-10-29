"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { usePhoneScreen } from "@/hooks/use-phone-screen";

// Pages made for a computer (direct instruction): on a phone they say so
// in place of a squashed page. The clients, a client's projects, a
// project's posts and a post itself fit a phone.
const COMPUTER_ONLY = [/^\/settings/, /^\/clients\/[^/]+\/(settings|knowledge)/, /^\/analytics/, /^\/calendar/, /^\/visibility/, /^\/profile/];

// Each new screen comes in with the Help panel's motion (direct
// instruction): a fade and a short slide from the right. Within Settings,
// or a client's Settings, the screen itself stays (its menu shouldn't
// slide every time a page is picked); their own content animates instead.
function screenKey(pathname: string) {
  if (pathname.startsWith("/settings")) return "/settings";
  const clientSettings = pathname.match(/^\/clients\/[^/]+\/settings/);
  return clientSettings ? clientSettings[0] : pathname;
}

export function ViewTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const phone = usePhoneScreen();
  return (
    <div key={screenKey(pathname)} className="view on screen-in">
      {phone && COMPUTER_ONLY.some((r) => r.test(pathname)) ? (
        <div className="pad">
          <div className="empty computer-only">
            <b>Open this on a computer</b>
            <span>This page is made for a bigger screen. On your phone, your clients, projects and posts are all here.</span>
            <Link className="btn sm" href="/dashboard">
              Go to Clients
            </Link>
          </div>
        </div>
      ) : (
        children
      )}
    </div>
  );
}
