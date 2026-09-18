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

const NAV_ITEMS = [
  { href: "/dashboard", label: "Clients", icon: ClientsIcon },
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
