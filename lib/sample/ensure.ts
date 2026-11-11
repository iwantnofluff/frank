import type { SupabaseClient } from "@supabase/supabase-js";
import { seedSampleClient } from "./seed";
import { removeSampleFiles, type SampleRemoval } from "./remove";

// Frank Tour and Help's Show Me always use the workspace's sample client
// (phase146, decided directly): this makes sure it's there and has what
// they point at, with the service role. A workspace without one (made
// before samples) gets one, hidden. One missing something (a post someone
// deleted, its comments resolved away) is reset: removed and made again as
// it was, kept hidden or kept as it was.

export interface SampleTargets {
  clientId: string;
  projectId: string;
  // Its Project (one-off pieces), for Track a Project.
  assetProjectId: string;
  // The posts each step shows best.
  posts: { stages: string; comments: string; concept: string };
}

interface Found {
  id: string;
  archived_at: string | null;
  sample_expires_at: string | null;
}

export async function ensureSample(admin: SupabaseClient, agencyId: string, actorId: string, force = false): Promise<SampleTargets> {
  const { data: rows, error } = await admin
    .from("clients")
    .select("id, archived_at, sample_expires_at")
    .eq("agency_id", agencyId)
    .eq("is_sample", true)
    .limit(1);
  if (error) throw error;
  const sample = (rows?.[0] ?? null) as Found | null;

  if (sample && !force) {
    const targets = await find(admin, sample.id);
    if (targets) return targets;
  }
  if (sample) {
    // Reset: everything it had, then made again in the same state.
    const { data: removal, error: removeError } = await admin.rpc("delete_sample_client", { p_client_id: sample.id });
    if (removeError) throw removeError;
    await removeSampleFiles(admin, removal as SampleRemoval);
  }
  const id = await seedSampleClient(admin, agencyId, actorId, {
    archived_at: sample ? sample.archived_at : new Date().toISOString(),
    sample_expires_at: sample ? sample.sample_expires_at : "infinity",
  });
  if (!id) {
    // Made at the same moment by someone else (one a workspace, phase148):
    // theirs, once it's ready.
    for (let i = 0; i < 20; i++) {
      const { data: other } = await admin.from("clients").select("id").eq("agency_id", agencyId).eq("is_sample", true).limit(1);
      const targets = other?.[0] ? await find(admin, other[0].id as string) : null;
      if (targets) return targets;
      await new Promise((r) => setTimeout(r, 1000));
    }
    throw new Error("Couldn't make the sample client");
  }
  const targets = await find(admin, id);
  if (!targets) throw new Error("The sample client was made without what the tour needs");
  return targets;
}

// What the tour needs: its Content Planner and its Project; a post in Internal Review with artwork
// (the stages); one in Client Review with a comment (the comments); one
// dated in Concept with its concept written (approving it). Null if any is
// missing.
async function find(admin: SupabaseClient, clientId: string): Promise<SampleTargets | null> {
  const { data: projects } = await admin.from("projects").select("id, delivery").eq("client_id", clientId).is("archived_at", null);
  const project = projects?.find((p) => p.delivery === "scheduled");
  const assetProject = projects?.find((p) => p.delivery === "continuous");
  if (!project || !assetProject) return null;
  const { data: posts } = await admin
    .from("creatives")
    .select("id, stage, concept, scheduled_at, versions:creative_versions(id), comments(id, deleted_at)")
    .eq("project_id", project.id)
    .is("archived_at", null)
    .order("position");
  const list = (posts ?? []) as {
    id: string;
    stage: number;
    concept: string | null;
    scheduled_at: string | null;
    versions: { id: string }[];
    comments: { id: string; deleted_at: string | null }[];
  }[];
  const stages = list.find((p) => p.stage === 3 && p.versions.length > 0);
  const comments = list.find((p) => p.stage === 4 && p.comments.some((c) => !c.deleted_at));
  const concept = list.find((p) => p.stage === 1 && !!p.scheduled_at && !!p.concept?.trim());
  if (!stages || !comments || !concept) return null;
  return { clientId, projectId: project.id as string, assetProjectId: assetProject.id as string, posts: { stages: stages.id, comments: comments.id, concept: concept.id } };
}
