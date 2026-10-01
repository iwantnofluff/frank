import { createHash, randomBytes } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { test, expect, APP_URL, type Frank } from "./fixtures";

const ONE_PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

async function staffUserId(frank: Frank) {
  const { data } = await admin.from("users").select("id").eq("email", frank.staffEmail).single();
  return data!.id as string;
}

async function makeStaffOwner(frank: Frank) {
  const { error } = await admin
    .from("memberships")
    .update({ role: "owner" })
    .eq("agency_id", frank.agencyId)
    .eq("user_id", await staffUserId(frank));
  if (error) throw error;
}

// The accept side is seeded directly: the raw token only ever exists in the
// email, which the suite never sends (.invalid is skipped), so a spec that
// needs a working link has to mint its own and store the hash the same way.
async function seedInvite(frank: Frank, opts: { expiresInMs: number }) {
  const email = `e2e-invitee-${Date.now()}-${randomBytes(3).toString("hex")}@example.invalid`;
  const { data: created, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (error) throw error;
  const userId = created.user.id;
  await admin.from("users").insert({ id: userId, email, name: "placeholder" });
  const { data: m, error: mErr } = await admin
    .from("memberships")
    .insert({ agency_id: frank.agencyId, user_id: userId, role: "admin", accepted_at: null })
    .select("id")
    .single();
  if (mErr) throw mErr;
  const token = randomBytes(32).toString("base64url");
  const { error: iErr } = await admin.from("invites").insert({
    membership_id: m.id,
    token_hash: createHash("sha256").update(token).digest("hex"),
    expires_at: new Date(Date.now() + opts.expiresInMs).toISOString(),
    created_by: await staffUserId(frank),
  });
  if (iErr) throw iErr;
  return { email, userId, membershipId: m.id as string, token };
}

test("an Owner invites a User with access to one client, and re-sending replaces the link", async ({
  page,
  frank,
}) => {
  await makeStaffOwner(frank);
  await frank.loginAsStaff(page);
  await page.goto(`${APP_URL}/settings/team`);

  const email = `e2e-invitee-${Date.now()}@example.invalid`;
  await page.getByRole("button", { name: "Invite Member" }).click();
  const modal = page.getByRole("dialog", { name: "Invite Team Member" });
  await modal.getByLabel("Email Address").fill(email);
  await modal.getByLabel("Role").selectOption("user");
  await modal.getByRole("checkbox", { name: "E2E Test Client" }).click();
  await expect(modal.getByRole("checkbox", { name: "E2E Test Client" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await modal.getByRole("button", { name: "Send Invite" }).click();

  await expect(modal).toHaveCount(0);
  await expect(page.getByRole("status")).toHaveText(`Invite sent to ${email}`);
  const row = page.locator(".crow", { hasText: email });
  await expect(row).toContainText("User");
  await expect(row).toContainText("Invited");

  const { data: m } = await admin
    .from("memberships")
    .select("id, role, accepted_at, invited_by")
    .eq("agency_id", frank.agencyId)
    .eq("user_id", (await admin.from("users").select("id").eq("email", email).single()).data!.id)
    .single();
  expect(m!.role).toBe("user");
  expect(m!.accepted_at).toBeNull();
  expect(m!.invited_by).toBe(await staffUserId(frank));

  const { data: access } = await admin
    .from("staff_client_access")
    .select("client_id")
    .eq("membership_id", m!.id);
  expect(access).toEqual([{ client_id: frank.clientId }]);

  const { data: firstInvites } = await admin
    .from("invites")
    .select("id, expires_at")
    .eq("membership_id", m!.id);
  expect(firstInvites).toHaveLength(1);
  const hoursLeft = (new Date(firstInvites![0].expires_at).getTime() - Date.now()) / 3_600_000;
  expect(hoursLeft).toBeGreaterThan(47.9);
  expect(hoursLeft).toBeLessThanOrEqual(48);

  await page.getByRole("button", { name: "Invite Member" }).click();
  await modal.getByLabel("Email Address").fill(email);
  await modal.getByLabel("Role").selectOption("user");
  await modal.getByRole("button", { name: "Send Invite" }).click();
  await expect(modal).toHaveCount(0);

  const { data: secondInvites } = await admin
    .from("invites")
    .select("id")
    .eq("membership_id", m!.id);
  expect(secondInvites).toHaveLength(1);
  expect(secondInvites![0].id).not.toBe(firstInvites![0].id);
  await expect(page.locator(".crow", { hasText: email })).toHaveCount(1);
});

test("an Admin can't invite — no button, and the route refuses them", async ({ page, frank }) => {
  await frank.loginAsStaff(page);
  await page.goto(`${APP_URL}/settings/team`);
  await expect(page.locator(".crow", { hasText: frank.staffEmail })).toBeVisible();
  await expect(page.getByRole("button", { name: "Invite Member" })).toHaveCount(0);

  const res = await page.request.post(`${APP_URL}/api/team/invite`, {
    data: {
      agencyId: frank.agencyId,
      email: `e2e-invitee-${Date.now()}@example.invalid`,
      role: "user",
      clientIds: [],
    },
  });
  expect(res.status()).toBe(403);
});

test("accepting an invite collects a title-cased profile and photo, signs in, and can't be reused", async ({
  browser,
  frank,
}) => {
  const invite = await seedInvite(frank, { expiresInMs: 60 * 60 * 1000 });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(`${APP_URL}/invite/${invite.token}`);
  await expect(page.getByRole("heading", { name: "Join E2E Test Agency on Frank" })).toBeVisible();
  await expect(page.getByLabel("Email")).toHaveValue(invite.email);

  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.locator(".autherr")).toHaveText("Enter your first name");

  // Typed in lowercase on purpose: each field title-cases as you leave it.
  await page.getByLabel("First name").fill("invited");
  await page.getByLabel("Last name").fill("person");
  await page.getByLabel("Last name").blur();
  await expect(page.getByLabel("First name")).toHaveValue("Invited");
  await expect(page.getByLabel("Last name")).toHaveValue("Person");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.locator(".autherr")).toHaveText("Enter your designation");
  await page.getByLabel("Designation").fill("head of design");
  await page.getByLabel("Designation").blur();
  await expect(page.getByLabel("Designation")).toHaveValue("Head of Design");
  await page.getByLabel(/Short bio/).fill("Makes things look good.");

  await page.getByLabel("Profile photo").setInputFiles({
    name: "me.png",
    mimeType: "image/png",
    buffer: ONE_PIXEL_PNG,
  });
  // Picking a photo opens the cropper; a 1px image has no face to find, so
  // it falls back to a centred square and says so.
  const cropper = page.getByRole("dialog", { name: "Position your photo" });
  await expect(cropper.getByRole("status")).toHaveText(/Couldn't spot a face/, { timeout: 30000 });
  await cropper.getByRole("button", { name: "Use photo" }).click();
  await expect(cropper).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Change photo" })).toBeVisible();

  await page.getByLabel("Password").fill("short");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.locator(".autherr")).toHaveText("Use at least 8 characters for your password");

  await page.getByLabel("Password").fill("E2e-Invitee-1234!");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(`${APP_URL}/dashboard`, { timeout: 15000 });

  const { data: m } = await admin
    .from("memberships")
    .select("accepted_at")
    .eq("id", invite.membershipId)
    .single();
  expect(m!.accepted_at).not.toBeNull();
  const { data: u } = await admin
    .from("users")
    .select("name, first_name, last_name, designation, bio, avatar_asset_id")
    .eq("id", invite.userId)
    .single();
  expect(u).toMatchObject({
    name: "Invited Person",
    first_name: "Invited",
    last_name: "Person",
    designation: "Head of Design",
    bio: "Makes things look good.",
  });
  expect(u!.avatar_asset_id).not.toBeNull();
  const { data: photo } = await admin
    .from("assets")
    .select("storage_key, mime_type")
    .eq("id", u!.avatar_asset_id)
    .single();
  // What's stored is the cropper's re-encoded square, not the original file.
  expect(photo!.mime_type).toBe("image/jpeg");
  expect(photo!.storage_key).toMatch(new RegExp(`^${frank.agencyId}/avatars/${invite.userId}/`));
  const { data: file, error: fileError } = await admin.storage.from("assets").download(photo!.storage_key);
  expect(fileError).toBeNull();
  expect(file!.size).toBeGreaterThan(0);
  expect(file!.type).toBe("image/jpeg");
  await admin.storage.from("assets").remove([photo!.storage_key]);

  const fresh = await browser.newContext();
  const again = await fresh.newPage();
  await again.goto(`${APP_URL}/invite/${invite.token}`);
  await expect(again.getByRole("heading", { name: "You've already joined" })).toBeVisible();
  await fresh.close();
  await context.close();
});

test("expired and unknown invite links say so instead of offering a form", async ({ browser, frank }) => {
  const expired = await seedInvite(frank, { expiresInMs: -60 * 1000 });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(`${APP_URL}/invite/${expired.token}`);
  await expect(page.getByRole("heading", { name: "This invite has expired" })).toBeVisible();
  await expect(page.getByLabel("Password")).toHaveCount(0);

  await page.goto(`${APP_URL}/invite/${randomBytes(32).toString("base64url")}`);
  await expect(page.getByRole("heading", { name: "This invite link isn't valid" })).toBeVisible();
  await context.close();
});

test("someone who already uses Frank just accepts, without setting a password", async ({
  browser,
  frank,
}) => {
  const invite = await seedInvite(frank, { expiresInMs: 60 * 60 * 1000 });
  const password = "E2e-Existing-1234!";
  await admin.auth.admin.updateUserById(invite.userId, { password });
  const existing = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } },
  );
  const { error } = await existing.auth.signInWithPassword({ email: invite.email, password });
  if (error) throw error;

  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${APP_URL}/invite/${invite.token}`);
  await expect(page.getByRole("button", { name: "Accept invite" })).toBeVisible();
  await expect(page.getByLabel("Password")).toHaveCount(0);
  await page.getByRole("button", { name: "Accept invite" }).click();
  await page.waitForURL(/\/login/, { timeout: 15000 });

  const { data: m } = await admin
    .from("memberships")
    .select("accepted_at")
    .eq("id", invite.membershipId)
    .single();
  expect(m!.accepted_at).not.toBeNull();
  await context.close();
});

test("the face detector's files load without a session, for the invite page", async ({ browser }) => {
  const context = await browser.newContext();
  for (const file of [
    "/mediapipe/blaze_face_short_range.tflite",
    "/mediapipe/wasm/vision_wasm_internal.wasm",
    "/mediapipe/wasm/vision_wasm_internal.js",
    "/mediapipe/wasm/vision_wasm_nosimd_internal.wasm",
    "/mediapipe/wasm/vision_wasm_nosimd_internal.js",
  ]) {
    const res = await context.request.get(`${APP_URL}${file}`, { maxRedirects: 0 });
    expect(res.status(), file).toBe(200);
    expect((await res.body()).length, file).toBeGreaterThan(100_000);
  }
  await context.close();
});
