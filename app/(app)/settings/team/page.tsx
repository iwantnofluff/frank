"use client";

import { useMyAgency } from "@/hooks/use-my-agency";
import { useTeamMembers } from "@/hooks/use-team-members";

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  user: "User",
  finance: "Finance",
};

export default function TeamSettingsPage() {
  const { data: agency } = useMyAgency();
  const { data: members, isLoading, isError } = useTeamMembers(agency?.agencyId);

  return (
    <div className="pad">
      <h1 className="h1">Team</h1>
      <p className="sub">Everyone with staff access at {agency?.name ?? "this agency"}.</p>

      {isError && (
        <div className="empty">
          <b>Couldn&rsquo;t load the team</b>
        </div>
      )}

      {!isError && !isLoading && members?.length === 0 && (
        <div className="empty">
          <b>No team members yet</b>
        </div>
      )}

      {!isError && members && members.length > 0 && (
        <div className="clients" style={{ marginTop: 16 }}>
          <div className="crow head" style={{ gridTemplateColumns: "1fr 1fr 120px 120px" }}>
            <div>Name</div>
            <div>Email</div>
            <div>Role</div>
            <div>Status</div>
          </div>
          {members.map((m) => (
            <div
              className="crow"
              key={m.id}
              style={{ gridTemplateColumns: "1fr 1fr 120px 120px", cursor: "default" }}
            >
              <div style={{ fontSize: 13.5, fontWeight: 500 }}>
                {m.user?.name ?? "—"}
              </div>
              <div style={{ fontSize: 13, color: "var(--muted)" }}>
                {m.user?.email ?? "—"}
              </div>
              <div>
                <span className="tag blue">{ROLE_LABELS[m.role] ?? m.role}</span>
              </div>
              <div>
                <span className={`tag ${m.accepted_at ? "green" : "grey"}`}>
                  {m.accepted_at ? "Active" : "Invited"}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
