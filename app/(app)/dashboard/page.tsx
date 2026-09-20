"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useClients } from "@/hooks/use-clients";
import { useMyAgency } from "@/hooks/use-my-agency";
import { useAgencyCreativeStats } from "@/hooks/use-agency-creative-stats";
import { SearchIcon } from "@/components/app-shell/icons";

type Filter = "active" | "archived";

function clientInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

export default function DashboardPage() {
  const { data: clients, isLoading, isError, error } = useClients();
  const { data: agency } = useMyAgency();
  // isPending, not isLoading: this query stays disabled (and isLoading
  // false, since it isn't fetching) until agency.agencyId resolves, so
  // isLoading alone would flash a false "done, no data" state — the same
  // shape as the isStaff loading-flash bug — before the query has even
  // started. isPending stays true the whole time there's no data yet,
  // disabled or not.
  const { data: creativeStats, isPending: statsLoading } =
    useAgencyCreativeStats(agency?.agencyId);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("active");

  const filtered = useMemo(() => {
    if (!clients) return [];
    const q = query.trim().toLowerCase();
    return clients.filter((c) => {
      const matchesFilter =
        filter === "active" ? !c.archived_at : !!c.archived_at;
      const matchesQuery =
        !q ||
        c.name.toLowerCase().includes(q) ||
        (c.industry ?? "").toLowerCase().includes(q);
      return matchesFilter && matchesQuery;
    });
  }, [clients, query, filter]);

  const activeCount = clients?.filter((c) => !c.archived_at).length ?? 0;

  return (
    <div className="pad">
      <h1 className="h1">Clients</h1>
      <p className="sub">
        {isLoading
          ? "Loading your clients…"
          : `${activeCount} active client${activeCount === 1 ? "" : "s"}.`}
      </p>

      <div className="stats">
        <div className="stat">
          <div className="n">{activeCount}</div>
          <div className="l">Active Clients</div>
        </div>
        <div className="stat">
          <div className="n">{statsLoading ? "…" : (creativeStats?.liveProjects ?? 0)}</div>
          <div className="l">Live Projects</div>
        </div>
        <div className="stat">
          <div className={`n${statsLoading ? "" : " flag"}`}>
            {statsLoading ? "…" : (creativeStats?.waitingOnApproval ?? 0)}
          </div>
          <div className="l">Waiting on Approval</div>
        </div>
        <div className="stat">
          <div className={`n${statsLoading ? "" : " flag"}`}>
            {statsLoading ? "…" : (creativeStats?.feedbackToAction ?? 0)}
          </div>
          <div className="l">Feedback to Action</div>
        </div>
      </div>

      <div className="listsearch">
        <SearchIcon />
        <input
          placeholder="Search clients you work with"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="secthead">
        <h2>All Clients</h2>
        <span className="count">
          {filtered.length} account{filtered.length === 1 ? "" : "s"}
        </span>
        <div className="filters">
          <button
            className="chip"
            aria-pressed={filter === "active"}
            onClick={() => setFilter("active")}
            type="button"
          >
            Active
          </button>
          <button
            className="chip"
            aria-pressed={filter === "archived"}
            onClick={() => setFilter("archived")}
            type="button"
          >
            Archived
          </button>
        </div>
      </div>

      {isError && (
        <div className="empty">
          <b>Couldn&rsquo;t load clients</b>
          <span>{error instanceof Error ? error.message : "Unknown error"}</span>
        </div>
      )}

      {!isError && !isLoading && filtered.length === 0 && (
        <div className="empty">
          <b>
            {query
              ? `No clients match “${query}”`
              : filter === "archived"
                ? "No archived clients"
                : "No clients yet"}
          </b>
          <span>
            {query
              ? "Try a different name."
              : "Archived accounts keep their history and stop counting toward your plan."}
          </span>
        </div>
      )}

      {!isError && filtered.length > 0 && (
        <div className="clients">
          <div className="crow head">
            <div>Client</div>
            <div>Projects</div>
            <div>Approval progress</div>
            <div>Status</div>
            <div className="ago">Last activity</div>
            <div></div>
          </div>
          {filtered.map((c) => (
            <Link href={`/clients/${c.id}`} className="crow" key={c.id}>
              <div className="cname">
                <div
                  className="logo"
                  style={{ background: c.accent_colour || "#6B7280" }}
                >
                  {clientInitials(c.name)}
                </div>
                <div className="t">
                  <b>{c.name}</b>
                  <span>{c.industry || "—"}</span>
                </div>
              </div>
              <div style={{ fontSize: 13, color: "var(--muted)" }}>—</div>
              <div style={{ fontSize: 13, color: "var(--muted)" }}>—</div>
              <div>
                <span className={`tag ${c.archived_at ? "grey" : "blue"}`}>
                  <span className="dot" />
                  {c.archived_at ? "Archived" : "Active"}
                </span>
              </div>
              <div className="ago">—</div>
              <div></div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
