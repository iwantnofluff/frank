import { NAV_ICONS, NAV_ICON_VIEWBOX } from "@/lib/nav-icons";
// Ported directly from the <svg> markup in frank-prototype.html's nav rail
// and topbar (.rbtn, .search, .bell). Paths are copied as-is; only the
// wrapper became a component.

export function ClientsIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <rect x="4" y="4" width="7" height="7" rx="1.6" />
      <rect x="13" y="4" width="7" height="7" rx="1.6" />
      <rect x="4" y="13" width="7" height="7" rx="1.6" />
      <rect x="13" y="13" width="7" height="7" rx="1.6" />
    </svg>
  );
}

export function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M4 10h16" />
      <path d="M9 3v4" />
      <path d="M15 3v4" />
    </svg>
  );
}

export function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.2a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-3-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H2.5a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.2-3l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V2.5a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 3 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1h.2a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </svg>
  );
}

// Opens a client's or project's profile (phase46). The prototype has no
// such icon; drawn to match the rows' other line icons (docs/parity-gaps.md).
export function ExpandIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
    </svg>
  );
}

export function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  );
}

export function BellIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" />
    </svg>
  );
}

// Not in the prototype, which has no folder glyph anywhere: drawn to match
// the rail's other icons (24px grid, the same stroke the rail applies).
export function ProjectsIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="M4 7.5A1.5 1.5 0 0 1 5.5 6h4.2l2 2.3h6.8A1.5 1.5 0 0 1 20 9.8v8.7a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5z" />
    </svg>
  );
}

// Help: a question mark in a circle (direct instruction, in the bell's place).
export function HelpIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.2a2.6 2.6 0 0 1 5 .9c0 1.7-2.5 2.2-2.5 3.9" />
      <path d="M12 17.2v.01" />
    </svg>
  );
}


// A client, in the rail (direct instruction: the buildings icon, as Client
// Settings' Profile uses, looking like the rail's own). The drawing is
// filled shapes on a 1200 grid (lib/nav-icons.ts); filled and outlined so
// its lines come out as thick as the rail's 1.25 strokes at this size.
export function ClientIcon() {
  return (
    <svg viewBox={NAV_ICON_VIEWBOX.buildings} style={{ fill: "currentColor", strokeWidth: 30 }} aria-hidden="true">
      {NAV_ICONS.buildings.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
