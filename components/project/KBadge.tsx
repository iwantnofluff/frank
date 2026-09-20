// Ported from the prototype's KBADGE(k) — the delivery-mode pill. Used to
// be a standalone "Mode" column in the project table; the prototype puts
// it in the row's .sub line under the project name instead (see
// docs/parity-gaps.md, "Client workspace and project table").
export function KBadge({ delivery }: { delivery: "scheduled" | "continuous" }) {
  if (delivery === "continuous") {
    return (
      <span className="kbadge con">
        <svg viewBox="0 0 24 24">
          <path d="M4 6h16M4 12h16M4 18h10" />
          <path d="M17 16l2 2 4-4" />
        </svg>
        Continuous
      </span>
    );
  }
  return (
    <span className="kbadge sch">
      <svg viewBox="0 0 24 24">
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M3 10h18M8 3v4M16 3v4" />
      </svg>
      Scheduled
    </span>
  );
}
