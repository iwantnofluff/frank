// The post page's own queries, shared by the browser's hooks and the
// server, which reads them while preparing the page so its artwork shows
// at once (direct instruction). Not a "use client" module, so the server
// can call it.

export const CREATIVE_SELECT =
  "id, agency_id, project_id, name, format, stage, exception, lead_user_id, team_user_ids, scheduled_at, formats, destination, due_on, concept, reference_url, reference_urls, slide_count, slide_text, slide_notes, voiceover, approach_notes, artwork_removed_at, cx, updated_at, updated_by, projects(id, name, delivery, client_id, clients(name))";

export const CREATIVE_VERSIONS_SELECT =
  "id, version_no, note, created_at, asset:assets(id, storage_key, filename, mime_type), slides:creative_version_slides(position, asset:assets(id, storage_key, filename, mime_type))";

export interface VersionAsset {
  id: string;
  storage_key: string;
  filename: string;
  mime_type: string;
}

export interface CreativeVersionRow {
  id: string;
  version_no: number;
  note: string | null;
  created_at: string;
  asset: VersionAsset | null;
  // A carousel version's slides, in order (phase31). Empty for a single
  // image — use versionSlides() rather than reading this directly.
  // The asset is null when the viewer can't read that file.
  slides: { position: number; asset: VersionAsset | null }[];
}

// Every slide of a version, in order: a carousel's own slides, or a single
// upload as its one slide.
export function versionSlides(v: CreativeVersionRow | null | undefined): { position: number; asset: VersionAsset }[] {
  if (!v) return [];
  // A slide whose file can't be read is left out rather than breaking the
  // page; an empty version (every slide removed) has none at all.
  if (v.slides?.length)
    return v.slides
      .filter((s): s is { position: number; asset: VersionAsset } => !!s.asset)
      .sort((a, b) => a.position - b.position);
  return v.asset ? [{ position: 1, asset: v.asset }] : [];
}
