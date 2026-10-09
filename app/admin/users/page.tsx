"use client";

import { useMemo, useState } from "react";
import { useAdminUsers } from "@/hooks/use-admin-users";
import { PeopleTable } from "@/components/admin/PeopleTable";
import { SearchIcon } from "@/components/app-shell/icons";
import { errorMessage } from "@/lib/errors";

// Everyone on Frank, with their agencies and roles (decided directly,
// 4 Oct 2026). View-only: a person's page has the rest.
export default function AdminUsersPage() {
  const { data: people, isLoading, error } = useAdminUsers();
  const [query, setQuery] = useState("");
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = people ?? [];
    if (!q) return list;
    return list.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.email.toLowerCase().includes(q) ||
        p.memberships.some(
          (m) => m.agencyName.toLowerCase().includes(q) || (m.agencySubdomain ?? "").toLowerCase().includes(q),
        ),
    );
  }, [people, query]);

  return (
    <>
      <div className="adminhead">
        <div>
          <h1 className="h1">Users</h1>
          <p className="sub">{people ? `${people.length} ${people.length === 1 ? "person" : "people"} on Frank.` : " "}</p>
        </div>
      </div>
      <div className="listsearch">
        <SearchIcon />
        <input
          placeholder="Search by name, email or workspace"
          aria-label="Search users"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      {isLoading && <p className="sub">Frank is working…</p>}
      {error && <p className="autherr">{errorMessage(error, "Couldn't load the users")}</p>}
      {people && (shown.length ? <PeopleTable people={shown} /> : <p className="sub">Nobody matches that.</p>)}
    </>
  );
}
