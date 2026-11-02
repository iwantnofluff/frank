"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAdminAgencies, useDeleteAgency, type AdminAgency } from "@/hooks/use-admin-agencies";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { SearchIcon } from "@/components/app-shell/icons";
import { errorMessage } from "@/lib/errors";
import { PLANS, formatBytes, isReadOnly, limitLabel, planById } from "@/lib/plans";
import { planRank } from "@/lib/billing/rules";
import { day, money, num } from "@/lib/admin/format";
import { ROOT_DOMAIN } from "@/lib/tenant";

type Who = "customers" | "internal" | "all";
type Status = "all" | "active" | "trial" | "read-only" | "paused" | "card" | "request";
type SortKey = "name" | "plan" | "members" | "clients" | "posts" | "storage" | "ai" | "cost" | "joined";

const STATUS_LABELS: Record<Status, string> = {
  all: "Any status",
  active: "Active",
  trial: "On a free trial",
  "read-only": "Read-only after trial",
  paused: "Paused",
  card: "Paying by card",
  request: "Asked for a plan",
};

function matchesStatus(a: AdminAgency, status: Status) {
  switch (status) {
    case "all":
      return true;
    case "active":
      return !a.suspended_at;
    case "trial":
      return a.plan === "free" && !isReadOnly(a.plan, a.trial_ends_at);
    case "read-only":
      return isReadOnly(a.plan, a.trial_ends_at);
    case "paused":
      return !!a.suspended_at;
    case "card":
      return a.pays_by_card;
    case "request":
      return !!a.pending_request;
  }
}

const SORTS: Record<SortKey, (a: AdminAgency) => number | string> = {
  name: (a) => a.name.toLowerCase(),
  plan: (a) => planRank(a.plan),
  members: (a) => a.members,
  clients: (a) => a.clients,
  posts: (a) => a.posts,
  storage: (a) => a.storage_bytes,
  ai: (a) => a.ai_this_month,
  cost: (a) => a.ai_cost_this_month,
  joined: (a) => a.created_at,
};

// A column heading that sorts the table; again reverses it.
function SortHead({
  label,
  k,
  sort,
  onSort,
}: {
  label: string;
  k: SortKey;
  sort: { key: SortKey; desc: boolean };
  onSort: (k: SortKey) => void;
}) {
  const on = sort.key === k;
  return (
    <th aria-sort={on ? (sort.desc ? "descending" : "ascending") : "none"}>
      <button type="button" className={`adminsort${on ? " on" : ""}`} onClick={() => onSort(k)}>
        {label}
        <span aria-hidden="true">{on ? (sort.desc ? "↓" : "↑") : ""}</span>
      </button>
    </th>
  );
}

// Every agency, with its usage against its limits. Searched, filtered and
// sorted here (decided directly, 2 Nov 2026); internal workspaces
// (phase130) are hidden unless asked for.
export default function AdminAgenciesPage() {
  const { data: agencies, isLoading, error } = useAdminAgencies();
  const router = useRouter();
  const params = useSearchParams();
  const remove = useDeleteAgency();
  const [deleting, setDeleting] = useState<AdminAgency | null>(null);
  const [deleted, setDeleted] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [who, setWho] = useState<Who>(params.get("internal") === "1" ? "internal" : "customers");
  const [plan, setPlan] = useState("all");
  const [status, setStatus] = useState<Status>("all");
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "joined", desc: true });
  const canDelete = !!agencies?.some((a) => a.can_delete);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = (agencies ?? []).filter(
      (a) =>
        (who === "all" || (who === "internal") === a.is_internal) &&
        (plan === "all" || a.plan === plan) &&
        matchesStatus(a, status) &&
        (!q ||
          a.name.toLowerCase().includes(q) ||
          (a.subdomain ?? "").toLowerCase().includes(q) ||
          (a.owner?.name ?? "").toLowerCase().includes(q) ||
          (a.owner?.email ?? "").toLowerCase().includes(q)),
    );
    const key = SORTS[sort.key];
    return list.sort((x, y) => {
      const a = key(x);
      const b = key(y);
      const c = a < b ? -1 : a > b ? 1 : 0;
      return sort.desc ? -c : c;
    });
  }, [agencies, query, who, plan, status, sort]);

  const onSort = (k: SortKey) =>
    setSort((s) => (s.key === k ? { key: k, desc: !s.desc } : { key: k, desc: k !== "name" && k !== "plan" }));
  const internalCount = (agencies ?? []).filter((a) => a.is_internal).length;

  return (
    <>
      <div className="adminhead">
        <div>
          <h1 className="h1">Workspaces</h1>
          <p className="sub">
            {agencies
              ? `${num(agencies.length - internalCount)} on Frank${internalCount ? `, and ${num(internalCount)} internal` : ""}.`
              : " "}
          </p>
        </div>
        <Link className="btn primary" href="/admin/agencies/new">
          New Workspace
        </Link>
      </div>
      <div className="adminfilters">
        <div className="listsearch">
          <SearchIcon />
          <input
            placeholder="Search by name, address or owner"
            aria-label="Search workspaces"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <select className="sort" aria-label="Which workspaces" value={who} onChange={(e) => setWho(e.target.value as Who)}>
          <option value="customers">Customers</option>
          <option value="internal">Internal</option>
          <option value="all">Customers and internal</option>
        </select>
        <select className="sort" aria-label="Plan" value={plan} onChange={(e) => setPlan(e.target.value)}>
          <option value="all">Any plan</option>
          {PLANS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select className="sort" aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value as Status)}>
          {(Object.keys(STATUS_LABELS) as Status[]).map((k) => (
            <option key={k} value={k}>
              {STATUS_LABELS[k]}
            </option>
          ))}
        </select>
      </div>
      {isLoading && <p className="sub">Frank is working…</p>}
      {deleted && <p className="bsaved">{deleted}</p>}
      {error && <p className="autherr">{errorMessage(error, "Couldn't load the workspaces")}</p>}
      {agencies && shown.length === 0 && <p className="sub">No workspace matches that.</p>}
      {agencies && shown.length > 0 && (
        <div className="admintbl-wrap">
          <table className="admintbl">
            <thead>
              <tr>
                <SortHead label="Workspace" k="name" sort={sort} onSort={onSort} />
                <SortHead label="Plan" k="plan" sort={sort} onSort={onSort} />
                <th>Primary Owner</th>
                <SortHead label="Members" k="members" sort={sort} onSort={onSort} />
                <SortHead label="Clients" k="clients" sort={sort} onSort={onSort} />
                <SortHead label="Posts" k="posts" sort={sort} onSort={onSort} />
                <SortHead label="Storage" k="storage" sort={sort} onSort={onSort} />
                <SortHead label="AI this month" k="ai" sort={sort} onSort={onSort} />
                <SortHead label="AI cost" k="cost" sort={sort} onSort={onSort} />
                <th>Status</th>
                <SortHead label="Joined" k="joined" sort={sort} onSort={onSort} />
                {canDelete && <th aria-label="Delete" />}
              </tr>
            </thead>
            <tbody>
              {shown.map((a) => (
                // The whole row opens the agency (direct instruction); the link
                // in it stays for the keyboard and a new tab.
                <tr key={a.id} className="admintbl-row" onClick={() => router.push(`/admin/agencies/${a.id}`)}>
                  <td>
                    <Link href={`/admin/agencies/${a.id}`} className="admintbl-name" onClick={(e) => e.stopPropagation()}>
                      {a.name}
                    </Link>
                    <span className="tdim">{a.subdomain ? `${a.subdomain}.${ROOT_DOMAIN}` : "No address"}</span>
                  </td>
                  <td>
                    {planById(a.plan)?.name ?? a.plan}
                    {a.pays_by_card && <span className="tdim">By card</span>}
                    {a.plan === "free" && (
                      <span className="tdim">
                        {isReadOnly(a.plan, a.trial_ends_at) ? "Trial ended, read-only" : `Trial ends ${day(a.trial_ends_at)}`}
                      </span>
                    )}
                  </td>
                  <td>
                    {a.owner ? (
                      <>
                        {a.owner.name}
                        <span className="tdim">{a.owner.email}</span>
                      </>
                    ) : (
                      <span className="tdim">—</span>
                    )}
                  </td>
                  <td>
                    {num(a.members)} / {limitLabel(a.seat_limit)}
                  </td>
                  <td>
                    {num(a.clients)} / {limitLabel(a.client_limit)}
                  </td>
                  <td>{num(a.posts)}</td>
                  <td>
                    {formatBytes(a.storage_bytes)} / {formatBytes(a.storage_limit_bytes)}
                  </td>
                  <td>
                    {num(a.ai_this_month)} / {num(a.ai_monthly_request_cap)}
                  </td>
                  <td>{a.ai_this_month === a.ai_unpriced_this_month && a.ai_this_month > 0 ? "—" : money(a.ai_cost_this_month)}</td>
                  <td>
                    <span className={`tag ${a.suspended_at ? "rose" : "green"}`}>{a.suspended_at ? "Paused" : "Active"}</span>
                    {a.is_internal && (
                      <span className="tag grey" style={{ marginTop: 4 }}>
                        Internal
                      </span>
                    )}
                    {a.pending_request && (
                      <span className="tdim" style={{ marginTop: 4 }}>
                        Wants {planById(a.pending_request.plan)?.name ?? a.pending_request.plan}
                      </span>
                    )}
                  </td>
                  <td className="tdim">{day(a.created_at)}</td>
                  {canDelete && (
                    <td>
                      <button
                        type="button"
                        className="btn sm danger"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleting(a);
                        }}
                      >
                        Delete
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {deleting && (
        <ConfirmDialog
          title={`Delete ${deleting.name}?`}
          message={`this deletes ${deleting.name}, every client, post and file in it, and the accounts of its people who aren't in another workspace, so their emails can sign up again. Staging only; it can't be undone.`}
          confirmLabel="Delete Workspace"
          pendingLabel="Deleting…"
          isPending={remove.isPending}
          error={remove.error}
          errorFallback="Couldn't delete the workspace"
          onConfirm={() =>
            remove
              .mutateAsync(deleting.id)
              .then((r) => {
                setDeleted(
                  `Deleted ${deleting.name}${r.accounts.length ? `, and the accounts of ${r.accounts.join(", ")}` : ""}.`,
                );
                setDeleting(null);
              })
              .catch(() => {})
          }
          onClose={() => {
            setDeleting(null);
            remove.reset();
          }}
        />
      )}
    </>
  );
}
