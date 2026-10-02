"use client";

import Link from "next/link";
import { useAdminAgencies } from "@/hooks/use-admin-agencies";
import { errorMessage } from "@/lib/errors";

const mb = (b: number) => (b < 1048576 ? `${Math.round(b / 1024)}KB` : `${(b / 1048576).toFixed(1)}MB`);

// Every agency, with its usage against its limits.
export default function AdminAgenciesPage() {
  const { data: agencies, isLoading, error } = useAdminAgencies();
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
            </tr>
          </thead>
          <tbody>
            {agencies.map((a) => (
              <tr key={a.id}>
                <td>
                  <Link href={`/admin/agencies/${a.id}`} className="admintbl-name">
                    {a.name}
                  </Link>
                  <span className="tdim">{a.subdomain ? `${a.subdomain}.beingfrank.app` : "No address"}</span>
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
                  {a.members} / {a.seat_limit}
                </td>
                <td>
                  {a.clients} / {a.client_limit}
                </td>
                <td>{a.posts}</td>
                <td>{mb(a.storage_bytes)}</td>
                <td>
                  {a.ai_this_month} / {a.ai_monthly_request_cap}
                </td>
                <td>
                  <span className={`tag ${a.suspended_at ? "rose" : "green"}`}>{a.suspended_at ? "Paused" : "Active"}</span>
                </td>
                <td className="tdim">{new Date(a.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
