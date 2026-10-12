import { QueryClient, dehydrate } from "@tanstack/react-query";
import { SeedQueries } from "@/components/ui/SeedQueries";
import { createClient } from "@/lib/supabase/server";
import { CREATIVE_SELECT, CREATIVE_VERSIONS_SELECT, versionSlides, type CreativeVersionRow } from "@/lib/creative-queries";
import { CreativeReviewPage } from "./CreativeReviewPage";

// A post's page. Its artwork used to wait for the page to load, then for
// the post's versions, then for a link to the file, one after the other
// (direct instruction: it showed late). The server now reads the post, its
// versions and links to the latest version's images, through the person's
// own session, and hands them to the page, so the image is in the first
// HTML. Anything that fails here the page simply fetches itself, as before.
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const queryClient = new QueryClient();

  const [creative, versions] = await Promise.all([
    supabase.from("creatives").select(CREATIVE_SELECT).eq("id", id).maybeSingle(),
    supabase.from("creative_versions").select(CREATIVE_VERSIONS_SELECT).eq("creative_id", id).order("version_no", { ascending: false }),
  ]);
  if (creative.data) queryClient.setQueryData(["creative", id], creative.data);
  if (versions.data) {
    const rows = versions.data as unknown as CreativeVersionRow[];
    queryClient.setQueryData(["creative-versions", id], rows);
    // The latest version's images (the page opens on it), signed in one go.
    const keys = versionSlides(rows[0])
      .filter((s) => s.asset.mime_type.startsWith("image/"))
      .map((s) => s.asset.storage_key);
    if (keys.length) {
      const { data: signed } = await supabase.storage.from("assets").createSignedUrls(keys, 3600);
      for (const s of signed ?? []) {
        if (s.path && s.signedUrl && !s.error) queryClient.setQueryData(["asset-signed-url", s.path], s.signedUrl);
      }
    }
  }

  return (
    <SeedQueries state={dehydrate(queryClient)}>
      <CreativeReviewPage id={id} />
    </SeedQueries>
  );
}
