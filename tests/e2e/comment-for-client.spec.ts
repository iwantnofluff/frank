import { createClient } from "@supabase/supabase-js";
import { test, expect, APP_URL, type Frank, TOUR_SEEN } from "./fixtures";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// A 1×1 PNG, enough for the artwork to render and take pins.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkaPhfDwAEhgGAj4c+ZQAAAABJRU5ErkJggg==",
  "base64",
);

// A User on the team, on the fixture's project only.
async function teamUser(frank: Frank) {
  const email = `e2e-member-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.invalid`;
  const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (error) throw error;
  const userId = data.user.id;
  await admin.from("users").insert({ tour_seen_at: TOUR_SEEN, id: userId, email, name: "Project User" });
  const { data: m, error: mErr } = await admin
    .from("memberships")
    .insert({ agency_id: frank.agencyId, user_id: userId, role: "user", accepted_at: new Date().toISOString() })
    .select("id")
    .single();
  if (mErr) throw mErr;
  await admin.from("project_access").upsert({ membership_id: m.id, project_id: frank.projectId }, { onConflict: "membership_id,project_id" });
  return { userId, membershipId: m.id as string };
}

// Feedback the client gave on the phone or WhatsApp (phase149, direct
// instruction): the team logs it on the client's behalf. It shows as the
// client's, via whoever logged it, for the team, the client and the review
// link; it's Public unless changed; and the rest of the team hears about it
// as a client comment, not the person who logged it.
test("the team logs a comment on the client's behalf", async ({ page, browser, frank }) => {
  test.setTimeout(150_000);
  const user = await teamUser(frank);
  try {
    await admin
      .from("client_preferences")
      .upsert({ client_id: frank.clientId, notify_in_app: true, notify_email: false, notify_who: "everyone" }, { onConflict: "client_id" });
    await frank.loginAsStaff(page);
    await page.goto(`${APP_URL}/creatives/${frank.creativeId}`);
    const box = page.locator("aside.cmts > .composer");
    await expect(box.locator("textarea")).toBeVisible({ timeout: 20_000 });
    await box.locator("textarea").fill("Make the logo bigger, said on WhatsApp");
    const priv = box.locator(".cf:not(.forcl) .intog input");
    await expect(priv).toBeChecked();
    await box.getByLabel("On behalf of E2E Test Client").check();
    // The client's words: Public.
    await expect(priv).not.toBeChecked();
    await box.getByLabel("Where the client said it").selectOption({ label: "WhatsApp" });
    await box.getByRole("button", { name: "Post", exact: true }).click();
    const card = page.locator(".cmt:not(.pending)", { hasText: "Make the logo bigger" });
    await expect(card.locator(".cmt-h b")).toHaveText("E2E Test Client via E2E Staff (WhatsApp)", { timeout: 15_000 });
    // Public in the footer, at the left, Reply first on the right (direct
    // instruction).
    await expect(card.locator(".cmt-f > .vis-tag")).toHaveText("Public");
    await expect(card.locator(".cmt-f .acts button").first()).toHaveText("Reply");
    // Ready for the next one: off again, and Private as it starts.
    await expect(box.getByLabel("On behalf of E2E Test Client")).not.toBeChecked();
    await expect(priv).toBeChecked();

    const { data: row } = await admin
      .from("comments")
      .select("id, for_client, client_source, visibility")
      .eq("creative_id", frank.creativeId)
      .eq("body", "Make the logo bigger, said on WhatsApp")
      .single();
    expect(row).toMatchObject({ for_client: true, client_source: "whatsapp", visibility: "public" });
    const { data: notes } = await admin.from("notifications").select("user_id, kind").eq("comment_id", row!.id);
    expect(notes).toEqual([{ user_id: user.userId, kind: "client_comment" }]);

    // The client sees it as theirs.
    const clientPage = await (await browser.newContext()).newPage();
    await frank.loginAsClient(clientPage);
    await clientPage.goto(`${APP_URL}/creatives/${frank.creativeId}`);
    await expect(clientPage.locator(".cmt", { hasText: "Make the logo bigger" }).locator(".cmt-h b")).toHaveText(
      "E2E Test Client via E2E Staff (WhatsApp)",
      { timeout: 20_000 },
    );
    // A client has nothing to log for anyone.
    await expect(clientPage.getByLabel(/On behalf of/)).toHaveCount(0);

    // And the review link.
    const token = await frank.createSharedLink();
    await clientPage.goto(`${APP_URL}/review/${token}`);
    await expect(clientPage.locator(".cmt", { hasText: "Make the logo bigger" }).locator(".cmt-h b")).toHaveText(
      "E2E Test Client via E2E Staff (WhatsApp)",
      { timeout: 20_000 },
    );
  } finally {
    await admin.from("notifications").delete().eq("user_id", user.userId);
    await admin.from("project_access").delete().eq("membership_id", user.membershipId);
    await admin.from("memberships").delete().eq("id", user.membershipId);
    await admin.from("users").delete().eq("id", user.userId);
    await admin.auth.admin.deleteUser(user.userId);
  }
});

// Only the team logs for the client, whoever writes the row: one of the
// client's own people, or a guest, already is the client. A source needs
// the comment to be for the client.
test("the database keeps logging for the client to the team", async ({ frank }) => {
  const { data: clientUser } = await admin.from("users").select("id").eq("email", frank.clientEmail).single();
  const { data: staffUser } = await admin.from("users").select("id").eq("email", frank.staffEmail).single();
  const base = { creative_id: frank.creativeId, visibility: "public", body: "Nope" };
  const asClient = await admin.from("comments").insert({ ...base, author_id: clientUser!.id, for_client: true });
  expect(asClient.error?.message).toContain("Only the team can log a comment for the client");
  const asGuest = await admin.from("comments").insert({ ...base, guest_name: "Guest", for_client: true });
  expect(asGuest.error?.message).toContain("Only the team can log a comment for the client");
  const sourceOnly = await admin.from("comments").insert({ ...base, author_id: staffUser!.id, client_source: "phone" });
  expect(sourceOnly.error?.message).toContain("comments_client_source_check");
  const { count } = await admin.from("comments").select("id", { count: "exact", head: true }).eq("creative_id", frank.creativeId);
  expect(count).toBe(0);
});

// A pin dropped or an area drawn goes straight to the comments' own box
// (direct instruction: no small box over the artwork), placed until it's
// posted or taken off.
test("a pin or an area goes straight to the comment box", async ({ page, frank }) => {
  test.setTimeout(120_000);
  const { data: staffUser } = await admin.from("users").select("id").eq("email", frank.staffEmail).single();
  const key = `${frank.agencyId}/${frank.creativeId}/seed-art.png`;
  await admin.storage.from("assets").upload(key, PNG, { contentType: "image/png" });
  const { data: asset } = await admin
    .from("assets")
    .insert({ agency_id: frank.agencyId, storage_key: key, filename: "art.png", mime_type: "image/png", bytes: 1, created_by: staffUser!.id })
    .select("id")
    .single();
  const { data: version } = await admin
    .from("creative_versions")
    .insert({ creative_id: frank.creativeId, version_no: 1, asset_id: asset!.id, created_by: staffUser!.id })
    .select("id")
    .single();
  await admin.from("creative_version_slides").insert({ creative_version_id: version!.id, position: 1, asset_id: asset!.id });

  await frank.loginAsStaff(page);
  await page.goto(`${APP_URL}/creatives/${frank.creativeId}`);
  const layer = page.locator(".ig-media .annot-layer");
  await expect(layer).toBeVisible({ timeout: 20_000 });
  const box = page.locator("aside.cmts > .composer");

  // A pin: in the box, ready to type, shown on the artwork meanwhile.
  await page.getByTitle("Pin comment").click();
  const f = (await layer.boundingBox())!;
  await page.mouse.click(f.x + f.width * 0.3, f.y + f.height * 0.4);
  await expect(box.locator(".cdraft")).toHaveText("Pin 1");
  await expect(box.locator("textarea")).toBeFocused();
  await expect(layer.locator(".annot-pin")).toHaveCount(1);
  await expect(page.getByTitle("Pin comment")).toHaveAttribute("aria-pressed", "false");
  // Taken off: gone from both.
  await box.getByRole("button", { name: "Remove it" }).click();
  await expect(box.locator(".cdraft")).toHaveCount(0);
  await expect(layer.locator(".annot-pin")).toHaveCount(0);

  // An area, posted.
  await page.getByTitle("Region comment").click();
  await page.mouse.move(f.x + f.width * 0.2, f.y + f.height * 0.2);
  await page.mouse.down();
  await page.mouse.move(f.x + f.width * 0.6, f.y + f.height * 0.5, { steps: 6 });
  await page.mouse.up();
  await expect(box.locator(".cdraft")).toHaveText("Region 1");
  await expect(box.locator("textarea")).toBeFocused();
  await page.keyboard.type("Too busy here");
  await box.getByRole("button", { name: "Post", exact: true }).click();
  await expect(page.locator(".cmt:not(.pending)", { hasText: "Too busy here" }).locator(".anchor")).toHaveText("Region 1", { timeout: 15_000 });
  await expect(box.locator(".cdraft")).toHaveCount(0);
  await expect(layer.locator(".annot-region")).toHaveCount(1);
  const { data: row } = await admin.from("comments").select("anchor, creative_version_id").eq("body", "Too busy here").single();
  expect(row!.creative_version_id).toBe(version!.id);
  expect(row!.anchor).toMatchObject({ type: "region", n: 1 });
});
