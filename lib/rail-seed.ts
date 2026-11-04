import type { SupabaseClient } from "@supabase/supabase-js";

// What the rail needs to name the client on a fresh page load (direct
// instruction: no delay before "<client> Projects" shows): read on the
// server for the page being opened, through the person's own session, so
// it's only ever what they can see. The rail uses it until its own queries
// answer, and only on the page it was read for.
export interface RailSeed {
  path: string;
  clientId: string;
  clientName: string;
  projectId: string | null;
  // The project's own name, for "<project> Planner" (direct instruction).
  projectName: string | null;
  delivery: "scheduled" | "continuous" | null;
}

type ClientRow = { id: string; name: string } | null;
type ProjectRow = { id: string; name: string; delivery: "scheduled" | "continuous"; client_id: string; clients: ClientRow } | null;

export async function railSeed(supabase: SupabaseClient, path: string | null): Promise<RailSeed | null> {
  if (!path) return null;
  const [, kind, id] = path.match(/^\/(clients|projects|creatives)\/([0-9a-f-]{36})(?:\/|$)/) ?? [];
  if (!kind || !id) return null;
  if (kind === "clients") {
    const { data } = await supabase.from("clients").select("id, name").eq("id", id).maybeSingle();
    return data ? { path, clientId: data.id, clientName: data.name, projectId: null, projectName: null, delivery: null } : null;
  }
  const projectOf = (p: ProjectRow): RailSeed | null =>
    p?.clients ? { path, clientId: p.clients.id, clientName: p.clients.name, projectId: p.id, projectName: p.name, delivery: p.delivery } : null;
  if (kind === "projects") {
    const { data } = await supabase.from("projects").select("id, name, delivery, client_id, clients(id, name)").eq("id", id).maybeSingle();
    return projectOf(data as unknown as ProjectRow);
  }
  const { data } = await supabase
    .from("creatives")
    .select("project:projects(id, name, delivery, client_id, clients(id, name))")
    .eq("id", id)
    .maybeSingle();
  return projectOf((data?.project ?? null) as unknown as ProjectRow);
}
