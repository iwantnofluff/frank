import { createClient } from "@supabase/supabase-js";
import { test, expect } from "./fixtures";
import { logLiveDates } from "@/lib/instagram/live-dates";
import { encryptToken } from "@/lib/instagram/secrets";

// When a post really went live (phase98, decided directly): the nightly
// run finds a scheduled post on its client's Instagram by its caption and
// logs when it went live and when it was due; the team can read it, a
// client can't; and an Approved post's artwork clock starts from it.
// Instagram itself is stood in for (fetch to graph.instagram.com answers
// with the posts below); the run is the real one, against the test
// agency only, so no real account is touched.

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const DAY = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();
const CAPTION = "The curve dates to 1908. The goal is not less pressure. It is knowing where you sit on the curve.";

async function signIn(email: string, password: string) {
  const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  await c.auth.signInWithPassword({ email, password });
  return c;
}

test("a scheduled post found live on Instagram by its caption is logged with its delay", async ({ frank }) => {
  test.setTimeout(90_000);
  const staffId = (await admin.from("users").select("id").eq("email", frank.staffEmail).single()).data!.id;
  // Due five days ago; on Instagram two days late, its caption tidied.
  await admin.from("creatives").update({ format: "ig_feed", formats: ["ig_feed"], scheduled_at: ago(5) }).eq("id", frank.creativeId);
  await frank.createCopyVersion(frank.creativeId, 1, { caption: CAPTION });
  // A Reel with words nowhere on Instagram.
  const { data: reel } = await admin
    .from("creatives")
    .insert({ project_id: frank.projectId, format: "ig_reel", formats: ["ig_reel"], name: "Not Out Yet", scheduled_at: ago(3), created_by: staffId })
    .select("id")
    .single();
  await frank.createCopyVersion(reel!.id, 1, { caption: "A reel nobody has posted yet, with a caption of its own." });

  const { data: conn } = await admin
    .from("instagram_connections")
    .insert({ client_id: frank.clientId, ig_user_id: "17841400000000001", username: "e2e_live", connected_by_name: "E2E Staff" })
    .select("id")
    .single();
  await admin.from("instagram_tokens").insert({
    connection_id: conn!.id,
    token_encrypted: encryptToken("e2e-token"),
    expires_at: new Date(Date.now() + 50 * DAY).toISOString(),
  });

  const liveAt = new Date(Date.now() - 3 * DAY).toISOString().replace(/\.\d+Z$/, "+0000");
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith("https://graph.instagram.com/me/media")) {
      return new Response(
        JSON.stringify({
          data: [
            { id: "m-live", caption: `  ${CAPTION.toUpperCase()}\n`, media_type: "IMAGE", media_product_type: "FEED", permalink: "https://www.instagram.com/p/LIVE/", timestamp: liveAt },
            { id: "m-other", caption: "Something else entirely", media_type: "VIDEO", media_product_type: "REELS", permalink: "https://www.instagram.com/reel/OTHER/", timestamp: liveAt },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (url.startsWith("https://graph.instagram.com")) throw new Error(`Unexpected Instagram call: ${url}`);
    return realFetch(input, init);
  }) as typeof fetch;
  try {
    const run = await logLiveDates(admin, frank.agencyId);
    expect(run).toEqual({ accounts: 1, logged: 1, moved: 1, failed: 0 });
    // Run again: nothing more, nothing twice.
    expect(await logLiveDates(admin, frank.agencyId)).toEqual({ accounts: 1, logged: 0, moved: 0, failed: 0 });
  } finally {
    globalThis.fetch = realFetch;
  }

  const { data: rows } = await admin.from("post_live_dates").select("*").eq("agency_id", frank.agencyId);
  expect(rows).toHaveLength(1);
  const row = rows![0];
  expect(row.creative_id).toBe(frank.creativeId);
  expect(row.instagram_media_id).toBe("m-live");
  expect(row.permalink).toBe("https://www.instagram.com/p/LIVE/");
  // Two days late.
  const late = (Date.parse(row.live_at) - Date.parse(row.scheduled_at)) / DAY;
  expect(late).toBeGreaterThan(1.99);
  expect(late).toBeLessThan(2.01);
  expect(row.source).toBe("instagram");

  // 5. Live (phase99); it was still in Client Review, so the agency's
  // Admin (the fixture's staff) is told it went out unapproved.
  const { data: post } = await admin.from("creatives").select("stage").eq("id", frank.creativeId).single();
  expect(post!.stage).toBe(5);
  const { data: told } = await admin.from("notifications").select("user_id").eq("kind", "live_unapproved").eq("creative_id", frank.creativeId);
  expect(told!.map((t) => t.user_id)).toEqual([staffId]);
  const { data: reelNow } = await admin.from("creatives").select("stage").eq("id", reel!.id).single();
  expect(reelNow!.stage).not.toBe(5);

  // The team reads it; a client doesn't.
  const staff = await signIn(frank.staffEmail, frank.staffPassword);
  expect((await staff.from("post_live_dates").select("creative_id")).data).toHaveLength(1);
  const client = await signIn(frank.clientEmail, frank.clientPassword);
  expect((await client.from("post_live_dates").select("creative_id")).data ?? []).toHaveLength(0);
  // Nobody signed in writes to it.
  const w = await staff.from("post_live_dates").update({ live_at: ago(1) }).eq("creative_id", frank.creativeId).select("creative_id");
  expect(w.data ?? []).toHaveLength(0);
});

test("an Approved post's artwork clock starts from when it really went live", async ({ frank }) => {
  test.setTimeout(60_000);
  const staffId = (await admin.from("users").select("id").eq("email", frank.staffEmail).single()).data!.id;
  // Both due ten days ago; one went live only two days ago.
  const seed = async (name: string) => {
    const { data: post } = await admin
      .from("creatives")
      .insert({ project_id: frank.projectId, format: "ig_feed", formats: ["ig_feed"], name, stage: 4, approved_at: ago(12), scheduled_at: ago(10), created_by: staffId })
      .select("id")
      .single();
    const key = `${frank.agencyId}/${post!.id}/${crypto.randomUUID()}-art.png`;
    const { data: asset } = await admin
      .from("assets")
      .insert({ agency_id: frank.agencyId, storage_key: key, filename: "art.png", mime_type: "image/png", bytes: 1, created_by: staffId })
      .select("id")
      .single();
    await admin.from("creative_versions").insert({ creative_id: post!.id, version_no: 1, asset_id: asset!.id, created_by: staffId });
    return { id: post!.id as string, key };
  };
  const late = await seed("Went Live Late");
  const onTime = await seed("Went Live On Time");
  const { error } = await admin
    .from("post_live_dates")
    .insert({ creative_id: late.id, instagram_media_id: "m-late", live_at: ago(2), scheduled_at: ago(10) });
  expect(error).toBeNull();

  const { data: keys, error: runError } = await admin.rpc("run_artwork_housekeeping", { p_agency_id: frank.agencyId });
  expect(runError).toBeNull();
  expect(keys as string[]).toContain(onTime.key);
  expect(keys as string[]).not.toContain(late.key);
});

test("the team sets Live by hand: its live date is now, shown after the planned date; back to Approved takes it away", async ({ page, frank }) => {
  test.setTimeout(90_000);
  // Approved, due two days ago: set Live now, it's late.
  await admin.from("creatives").update({ stage: 4, approved_at: ago(3), approved_by_name: "Client Person", scheduled_at: ago(2) }).eq("id", frank.creativeId);
  await frank.loginAsStaff(page);
  await page.goto(`/creatives/${frank.creativeId}`);
  await page.getByRole("button", { name: "Live", exact: true }).click();
  await expect(page.getByRole("button", { name: "Live", exact: true })).toHaveAttribute("aria-pressed", "true");
  const { data: row } = await admin.from("post_live_dates").select("source, live_at").eq("creative_id", frank.creativeId).single();
  expect(row!.source).toBe("manual");
  expect(Date.now() - Date.parse(row!.live_at)).toBeLessThan(5 * 60_000);
  // Planned date, then the live date in brackets, red as it's late.
  const liveDate = page.locator(".pnav-cur .pnav-live");
  await expect(liveDate).toHaveClass(/late/);
  await expect(liveDate).toHaveText(/^\(\d{1,2} [A-Z][a-z]{2} \d{2}\)$/);
  // Its approval is kept.
  const { data: post } = await admin.from("creatives").select("stage, approved_by_name").eq("id", frank.creativeId).single();
  expect(post).toEqual({ stage: 5, approved_by_name: "Client Person" });

  // Back to Approved: the hand-set date goes, the approval stays.
  await page.getByRole("button", { name: "Approved", exact: true }).click();
  await expect(page.getByRole("button", { name: "Approved", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(liveDate).toHaveCount(0);
  expect((await admin.from("post_live_dates").select("creative_id").eq("creative_id", frank.creativeId)).data).toEqual([]);
  const { data: back } = await admin.from("creatives").select("stage, approved_by_name").eq("id", frank.creativeId).single();
  expect(back).toEqual({ stage: 4, approved_by_name: "Client Person" });
});
