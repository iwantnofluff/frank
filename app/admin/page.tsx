"use client";

import { useState } from "react";
import Link from "next/link";
import { useAdminAgencies, useDeleteAgency, type AdminAgency } from "@/hooks/use-admin-agencies";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { errorMessage } from "@/lib/errors";
import { formatBytes, isReadOnly, limitLabel, planById } from "@/lib/plans";
import { ROOT_DOMAIN } from "@/lib/tenant";


// Every agency, with its usage against its limits.
export default function AdminAgenciesPage() {
  const { data: agencies, isLoading, error } = useAdminAgencies();
  const remove = useDeleteAgency();
  const [deleting, setDeleting] = useState<AdminAgency | null>(null);
  const [deleted, setDeleted] = useState<string | null>(null);
  const canDelete = !!agencies?.some((a) => a.can_delete);
  return (
    <>
      <div className="adminhead">
        <div>
          <h1 className="h1">Agencies</h1>
          <p className="sub">{agencies ? `${agencies.length} on Frank.` : " "}</p>
        </div>
        <Link className="btn primary" href="/admin/agencies/new">
          New Agency
        </Link>
      </div>
      {isLoading && <p className="sub">Loading…</p>}
      {deleted && <p className="bsaved">{deleted}</p>}
      {error && <p className="autherr">{errorMessage(error, "Couldn't load the agencies")}</p>}
      {agencies && (
        <table className="admintbl">
          <thead>
            <tr>
              <th>Agency</th>
              <th>Primary Owner</th>
              <th>Members</th>
              <th>Clients</th>
              <th>Posts</th>
              <th>Storage</th>
              <th>AI this month</th>
              <th>Status</th>
              <th>Joined</th>
              {canDelete && <th aria-label="Delete" />}
            </tr>
          </thead>
          <tbody>
            {agencies.map((a) => (
              <tr key={a.id}>
                <td>
                  <Link href={`/admin/agencies/${a.id}`} className="admintbl-name">
                    {a.name}
                  </Link>
                  <span className="tdim">{a.subdomain ? `${a.subdomain}.${ROOT_DOMAIN}` : "No address"}</span>
                  <span className="tdim">
                    {planById(a.plan)?.name ?? a.plan} plan
                    {a.plan === "free" &&
                      (isReadOnly(a.plan, a.trial_ends_at)
                        ? ", trial ended (read-only)"
                        : `, trial ends ${new Date(a.trial_ends_at!).toLocaleDateString()}`)}
                  </span>
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
                  {a.members} / {limitLabel(a.seat_limit)}
                </td>
                <td>
                  {a.clients} / {limitLabel(a.client_limit)}
                </td>
                <td>{a.posts}</td>
                <td>
                  {formatBytes(a.storage_bytes)} / {formatBytes(a.storage_limit_bytes)}
                </td>
                <td>
                  {a.ai_this_month} / {a.ai_monthly_request_cap}
                </td>
                <td>
                  <span className={`tag ${a.suspended_at ? "rose" : "green"}`}>{a.suspended_at ? "Paused" : "Active"}</span>
                  {a.pending_request && (
                    <span className="tdim" style={{ marginTop: 4 }}>
                      Wants {planById(a.pending_request.plan)?.name ?? a.pending_request.plan}
                    </span>
                  )}
                </td>
                <td className="tdim">{new Date(a.created_at).toLocaleDateString()}</td>
                {canDelete && (
                  <td>
                    <button type="button" className="btn sm danger" onClick={() => setDeleting(a)}>
                      Delete
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {deleting && (
        <ConfirmDialog
          title={`Delete ${deleting.name}?`}
          message={`this deletes ${deleting.name}, every client, post and file in it, and the accounts of its people who aren't in another agency, so their emails can sign up again. Staging only; it can't be undone.`}
          confirmLabel="Delete Agency"
          pendingLabel="Deleting…"
          isPending={remove.isPending}
          error={remove.error}
          errorFallback="Couldn't delete the agency"
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
