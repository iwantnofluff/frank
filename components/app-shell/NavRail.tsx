"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AnalyticsIcon,
  CalendarIcon,
  ClientsIcon,
  KnowledgeIcon,
  SettingsIcon,
  VisibilityIcon,
} from "./icons";

// Always visible, regardless of context.
const NAV_ITEMS = [
  { href: "/dashboard", label: "Clients", icon: ClientsIcon },
] as const;

// Calendar/Analytics/Visibility have no route yet — 404 if clicked at all
// (see docs/parity-gaps.md). Per the prototype's syncRail() (frank-
// prototype.html), these three are never shown outside a client context in
// the first place: `show = client||inClient` gates Calendar/Analytics (and
// Knowledge, below), `!client && inClient` gates Visibility specifically.
// `client` is the agency/client *preview* toggle (this app's
// store/ui-store.ts previewMode) — deliberately not replicated here: it
// isn't tied to any specific client route in this app's simpler model, and
// showing these links in more places than "inside a client" would add back
// dead-end click surface rather than remove it, which is the opposite of
// the point. `inClient` is the part that matters for this fix.
const CLIENT_CONTEXT_NAV_ITEMS = [
  { href: "/calendar", label: "Calendar", icon: CalendarIcon },
  { href: "/analytics", label: "Analytics", icon: AnalyticsIcon },
  { href: "/visibility", label: "Visibility", icon: VisibilityIcon },
] as const;

export function NavRail({ userInitials }: { userInitials: string }) {
  const pathname = usePathname();
  // Client knowledge lives in the rail only once a client is selected — it
  // has nothing to show otherwise (developer handover, "Knowledge, two
  // layers"). Agency-level knowledge (format directions) lives in Settings.
  const clientMatch = pathname.match(/^\/clients\/([^/]+)/);
  const clientId = clientMatch?.[1];

  return (
    <nav className="rail" aria-label="Main">
      <div className="mark">F</div>
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          className="rbtn"
          aria-current={pathname.startsWith(href)}
          title={label}
        >
          <span className="ric">
            <Icon />
          </span>
          <span className="rlab">{label}</span>
        </Link>
      ))}
      {clientId &&
        CLIENT_CONTEXT_NAV_ITEMS.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="rbtn"
            aria-current={pathname.startsWith(href)}
            title={label}
          >
            <span className="ric">
              <Icon />
            </span>
            <span className="rlab">{label}</span>
          </Link>
        ))}
      {clientId && (
        <Link
          href={`/clients/${clientId}/knowledge`}
          className="rbtn"
          aria-current={pathname.startsWith(`/clients/${clientId}/knowledge`)}
          title="Knowledge"
        >
          <span className="ric">
            <KnowledgeIcon />
          </span>
          <span className="rlab">Knowledge</span>
        </Link>
      )}
      <Link
        href="/settings"
        className="rbtn"
        aria-current={pathname.startsWith("/settings")}
        title="Settings"
        id="navSet"
      >
        <span className="ric">
          <SettingsIcon />
        </span>
        <span className="rlab">Settings</span>
      </Link>
      <div className="spacer" />
      <div className="avatar" title="Your account">
        {userInitials}
      </div>
    </nav>
  );
}
