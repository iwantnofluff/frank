"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useClients } from "@/hooks/use-clients";
import { useMyAgency } from "@/hooks/use-my-agency";
import { useAgencyCreativeStats } from "@/hooks/use-agency-creative-stats";
import { useClientListStats } from "@/hooks/use-client-list-stats";
import { useIsStaff } from "@/hooks/use-is-staff";
import { ExpandIcon, SearchIcon } from "@/components/app-shell/icons";
import { ClientModal } from "@/components/clients/ClientModal";
import { useAvatarUrls } from "@/hooks/use-avatar-urls";
import { errorMessage } from "@/lib/errors";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useMyProfile, useMyFirstName } from "@/hooks/use-my-profile";
import { addressed, pickGreeting } from "@/lib/greetings";

type Filter = "active" | "archived";

// Same final two column widths (date, then the actions menu) as the
// client workspace's own project table's override, so the "..." button
// lands in an identically-sized, identically-positioned slot on both
// screens — see PROJECT_ROW_COLUMNS there.
const CLIENT_ROW_COLUMNS = "1fr 96px 128px 92px 70px";

function clientInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
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
  const { data: clientListStats, isPending: clientStatsPending } =
    useClientListStats(agency?.agencyId);
  const { isStaff, isPending: isStaffPending } = useIsStaff();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("active");
  const [newClientOpen, setNewClientOpen] = useState(false);
  const router = useRouter();
  // Fails closed like every other isStaff gate in this app: hidden while
  // still resolving, not shown by default.
  const confirmedStaff = isStaff && !isStaffPending;

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
  const { data: currentUser } = useCurrentUser();
  const { isPending: profilePending } = useMyProfile();
  const firstName = useMyFirstName();
  const greeting =
    currentUser && !profilePending
      ? addressed(firstName, pickGreeting(currentUser.last_sign_in_at ?? currentUser.id))
      : null;
  const { data: logoUrls } = useAvatarUrls((clients ?? []).map((c) => c.logo_asset_id));

  return (
    <div className="pad">
      <h1 className="h1">Clients</h1>
      {/* Per direct instruction: a greeting by first name, a different one
          each sign-in, in place of the active-client count (which the stat
          below already shows). */}
      <p className="sub greeting">{greeting ?? "\u00a0"}</p>

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
        <div className="filters">
          <button
            className="chip"
            aria-pressed={filter === "active"}
            onClick={() => setFilter("active")}
            type="button"
          >
            Active ({activeCount})
          </button>
          <button
            className="chip"
            aria-pressed={filter === "archived"}
            onClick={() => setFilter("archived")}
            type="button"
          >
            Archived ({(clients?.length ?? 0) - activeCount})
          </button>
          {confirmedStaff && <span className="toolsep" />}
          {confirmedStaff && (
            <button
              className="btn sm"
              type="button"
              onClick={() => setNewClientOpen(true)}
            >
              New Client
            </button>
          )}
        </div>
      </div>

      {isError && (
        <div className="empty">
          <b>Couldn&rsquo;t load clients</b>
          <span>{errorMessage(error, "Unknown error")}</span>
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
          <div className="crow head" style={{ gridTemplateColumns: CLIENT_ROW_COLUMNS }}>
            <div>Client</div>
            <div className="ago">Projects</div>
            <div className="ago">Status</div>
            <div className="ago">Last Activity</div>
            <div></div>
          </div>
          {filtered.map((c) => (
            <Link
              href={`/clients/${c.id}`}
              className="crow"
              style={{ gridTemplateColumns: CLIENT_ROW_COLUMNS }}
              key={c.id}
            >
              <div className="cname">
                <div
                  className="logo"
                  style={{ background: c.accent_colour || "#6B7280" }}
                >
                  {/* A client with a logo: blank until it's here, never its
                      initials first (direct instruction: no flashing in). */}
                  {c.logo_asset_id ? (
                    logoUrls?.[c.logo_asset_id] ? (
                      // eslint-disable-next-line @next/next/no-img-element -- short-lived signed storage URL
                      <img src={logoUrls[c.logo_asset_id]} alt="" />
                    ) : null
                  ) : (
                    clientInitials(c.name)
                  )}
                </div>
                <div className="t">
                  <b>{c.name}</b>
                  <span>{c.industry || "—"}</span>
                </div>
              </div>
              <div className="ago">
                {clientStatsPending ? "…" : (clientListStats?.[c.id]?.activeProjectCount ?? 0)}
              </div>
              <div className="ago">
                <span className={`tag ${c.archived_at ? "grey" : "blue"}`}>
                  <span className="dot" />
                  {c.archived_at ? "Archived" : "Active"}
                </span>
              </div>
              <div className="ago">
                {clientStatsPending ? "…" : formatDate(clientListStats?.[c.id]?.lastActivityAt ?? null)}
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                {confirmedStaff && (
                  <button
                    type="button"
                    className="vdots"
                    title="Open Client Settings"
                    aria-label={`Open ${c.name}'s settings`}
                    onClick={(e) => {
                      // A button, not a link: the row is a link already.
                      e.preventDefault();
                      e.stopPropagation();
                      router.push(`/clients/${c.id}/settings`);
                    }}
                  >
                    <ExpandIcon />
                  </button>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}

      {newClientOpen && agency && (
        <ClientModal
          agencyId={agency.agencyId}
          activeClientCount={activeCount}
          onClose={() => setNewClientOpen(false)}
        />
      )}


    </div>
  );
}
