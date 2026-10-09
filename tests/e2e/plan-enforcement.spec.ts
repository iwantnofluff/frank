import { createClient } from "@supabase/supabase-js";
import { test, expect, APP_URL, type Frank } from "./fixtures";

// What a plan allows, enforced (phase41): new agencies on Free with a
// 30-day trial, read-only after it, storage by plan, branding from Growth,
// and an address of your own from Agency.

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const DAY = 86_400_000;

async function signedIn(email: string, password: string) {
  const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });
  const { error } = await c.auth.signInWithPassword({ email, password });
  expect(error).toBeNull();
  return c;
}

async function setRole(frank: Frank, role: string) {
  const id = (await admin.from("users").select("id").eq("email", frank.staffEmail).single()).data!.id;
  await admin.from("memberships").update({ role }).eq("agency_id", frank.agencyId).eq("user_id", id);
}

test("an agency signs itself up at beingfrank.app, confirms, works through its trial, goes read-only, and upgrading opens it again", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const ROOT = "http://frank.localhost:3000";
  const sub = `e2es${Date.now().toString(36)}`;
  const email = `e2e-signup-${Date.now()}@example.invalid`;
  const password = "E2e-Signup-1234!";
  const home = `http://${sub}.frank.localhost:3000`;
  const ctx = await browser.newContext();
  try {
    const page = await ctx.newPage();
    await page.goto(`${ROOT}/`);
    await expect(page.getByRole("button", { name: "Sign Up" })).toHaveAttribute("aria-pressed", "true");
    await page.getByLabel("Workspace name").fill("E2E Signup Agency");
    // The address follows the name until it's typed over, and says if it's free.
    await expect(page.getByLabel("Your address")).toHaveValue("e2e-signup-agency");
    await page.getByLabel("Your address").fill("nofluff");
    await expect(page.locator(".addr-bad")).toContainText("taken");
    await page.getByLabel("Your address").fill(sub);
    await expect(page.locator(".addr-ok")).toHaveText("Available");
    await page.getByLabel("First name").fill("sign");
    await page.getByLabel("Last name").fill("up");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.locator("form").getByRole("button", { name: "Start Free Trial" }).click();
    await expect(page.getByText("Check your email")).toBeVisible({ timeout: 20_000 });
    // Nothing to switch to once signed up.
    await expect(page.getByRole("button", { name: "Sign In" })).toHaveCount(0);
    await expect(page.locator(".signdone")).toContainText(`${sub}.frank.localhost:3000`);

    const { data: agency } = await admin
      .from("agencies")
      .select("id, name, plan, client_limit, seat_limit, storage_limit_bytes, trial_ends_at")
      .eq("subdomain", sub)
      .single();
    expect(agency).toMatchObject({ name: "E2E Signup Agency", plan: "free", client_limit: 1, seat_limit: 2, storage_limit_bytes: 524288000 });
    expect(Math.round((new Date(agency!.trial_ends_at).getTime() - Date.now()) / DAY)).toBe(30);
    const { data: owner } = await admin.from("memberships").select("role, accepted_at, user:users!memberships_user_id_fkey(name, email)").eq("agency_id", agency!.id).single();
    expect(owner).toMatchObject({ role: "primary_owner", user: { name: "Sign Up", email } });
    expect(owner!.accepted_at).not.toBeNull();

    // Not confirmed yet: signing in says so.
    await page.goto(`${home}/login`);
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');
    await expect(page.locator(".autherr")).toContainText("Confirm your email first");

    // The email's link (sent to a .invalid address, so made here the same
    // way): it confirms, signs in on the new address, and opens it.
    const { data: link } = await admin.auth.admin.generateLink({ type: "magiclink", email });
    await page.goto(`${home}/confirm?token_hash=${encodeURIComponent(link.properties!.hashed_token)}`);
    await page.waitForURL(`${home}/dashboard`, { timeout: 20_000 });
    await expect(page.locator(".robanner")).toHaveCount(0);

    // Signing in later starts at beingfrank.app too: it asks for the address.
    const other = await browser.newContext();
    const signin = await other.newPage();
    await signin.goto(`${ROOT}/`);
    await signin.getByRole("button", { name: "Sign In" }).click();
    await signin.getByLabel("Your account URL").fill("nosuchagency");
    await signin.getByRole("button", { name: "Continue" }).click();
    await expect(signin.locator(".autherr")).toContainText("no Frank workspace");
    await signin.getByLabel("Your account URL").fill(sub);
    await signin.getByRole("button", { name: "Continue" }).click();
    await signin.waitForURL(`${home}/login`);
    await expect(signin.getByRole("heading", { name: "Hey, sign in to E2E Signup Agency" })).toBeVisible();
    await signin.goto(`${ROOT}/`);
    await signin.getByRole("button", { name: "Sign In" }).click();
    await signin.getByRole("button", { name: "Forgot your address?" }).click();
    await signin.getByLabel("Email").fill(email);
    await signin.getByRole("button", { name: "Email My Addresses" }).click();
    await expect(signin.getByText("Check your email")).toBeVisible();
    await other.close();

    // During the trial: the owner works normally, within Free's limits.
    const me = await signedIn(email, password);
    const first = await me.from("clients").insert({ agency_id: agency!.id, name: "First Client" }).select("id");
    expect(first.error).toBeNull();
    const second = await me.from("clients").insert({ agency_id: agency!.id, name: "Second Client" });
    expect(second.error?.message).toContain("client limit reached (1)");
    await page.goto(`${home}/settings/plan/plans`);
    await expect(page.locator(".srow", { hasText: "Free trial" })).toContainText("Ends");

    // Thirty days on.
    await admin.from("agencies").update({ trial_ends_at: new Date(Date.now() - 1000).toISOString() }).eq("id", agency!.id);
    await page.goto(`${home}/dashboard`);
    await expect(page.locator(".robanner")).toContainText("free trial has ended");
    await expect(page.locator(".robanner").getByRole("link", { name: "Choose a Plan" })).toBeVisible();
    const blocked = await me.from("clients").update({ name: "Renamed" }).eq("id", first.data![0].id).select("id");
    expect(blocked.error?.message).toContain("agency is read-only");
    expect((await admin.from("clients").select("name").eq("id", first.data![0].id).single()).data!.name).toBe("First Client");
    await page.goto(`${home}/settings/plan/plans`);
    await expect(page.locator(".srow", { hasText: "Free trial" })).toContainText("Ended");
    // Paying is still possible: checkout is how a read-only agency gets out.
    const card = page.locator(".plancard", { has: page.locator(".plancard-h b", { hasText: /^Starter$/ }) });
    await expect(card.getByRole("button", { name: "Choose Starter" })).toBeEnabled();

    // Upgraded (as Paddle's webhook does it): working again, at once.
    await admin.from("agencies").update({ plan: "starter" }).eq("id", agency!.id);
    await page.goto(`${home}/dashboard`);
    await expect(page.locator(".robanner")).toHaveCount(0);
    const renamed = await me.from("clients").update({ name: "Renamed" }).eq("id", first.data![0].id).select("id");
    expect(renamed.error).toBeNull();
  } finally {
    await ctx.close();
    const { data: agency } = await admin.from("agencies").select("id").eq("subdomain", sub).maybeSingle();
    if (agency) {
      const { data: m } = await admin.from("memberships").select("user_id").eq("agency_id", agency.id);
      await admin.from("clients").delete().eq("agency_id", agency.id);
      await admin.from("memberships").delete().eq("agency_id", agency.id);
      await admin.from("agencies").delete().eq("id", agency.id);
      for (const row of m ?? []) {
        await admin.from("users").delete().eq("id", row.user_id);
        await admin.auth.admin.deleteUser(row.user_id);
      }
    }
  }
});

test("read-only also stops invites and uploads, with the reason", async ({ page, frank }) => {
  await admin
    .from("agencies")
    .update({ plan: "free", trial_ends_at: new Date(Date.now() - DAY).toISOString() })
    .eq("id", frank.agencyId);
  await setRole(frank, "owner");
  await frank.loginAsStaff(page);
  const invite = await page.request.post(`${APP_URL}/api/team/invite`, {
    data: { agencyId: frank.agencyId, email: `e2e-ro-${Date.now()}@example.invalid`, role: "admin" },
  });
  expect(invite.status()).toBe(403);
  expect((await invite.json()).error).toContain("free trial has ended");
  // The database refuses the file itself, whatever the browser does.
  const me = await signedIn(frank.staffEmail, frank.staffPassword);
  const up = await me.storage
    .from("assets")
    .upload(`${frank.agencyId}/knowledge/ro.csv`, new Blob(["a,b"], { type: "text/csv" }), { contentType: "text/csv" });
  expect(up.error).not.toBeNull();
});

// The refusal itself is the database's (enforce_storage_limits), checked on
// staging with a 3 KB limit; a plan's limit can't be set that low here
// (phase42 works it out from the plan), and the message is unit-tested
// (storageProblem, lib/plans.test.ts).
test("storage: usage against the plan on the Plans page, counting what's uploaded", async ({ page, frank }) => {
  await admin.from("agencies").update({ plan: "growth" }).eq("id", frank.agencyId);
  await frank.loginAsStaff(page);
  await page.goto(`${APP_URL}/settings/plan/plans`);
  const row = page.locator(".srow", { hasText: "Storage" });
  await expect(row).toContainText("0 KB of 25 GB");

  await page.goto(`${APP_URL}/settings/knowledge/reference-material`);
  // Not the header's own (Add Logo, shown while the agency has no logo).
  await page.locator('input[type="file"]:not([aria-label="Add Logo file"])').first().setInputFiles({
    name: "notes.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("x".repeat(40_000)),
  });
  await expect(page.locator(".autherr")).toHaveCount(0);
  await expect.poll(async () => (await admin.storage.from("assets").list(`${frank.agencyId}/knowledge`)).data?.length ?? 0).toBe(1);
  await page.goto(`${APP_URL}/settings/plan/plans`);
  await expect(row).toContainText("39 KB of 25 GB");
  const { data: files } = await admin.storage.from("assets").list(`${frank.agencyId}/knowledge`);
  await admin.storage.from("assets").remove((files ?? []).map((f) => `${frank.agencyId}/knowledge/${f.name}`));
});

test("branding: Frank's own look below Growth, the agency's from Growth", async ({ page, frank }) => {
  await admin
    .from("agency_settings")
    .upsert({ agency_id: frank.agencyId, theme: { action: "#047857" } }, { onConflict: "agency_id" });
  const action = () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--action").trim());

  await frank.loginAsStaff(page); // Starter
  await page.goto(`${APP_URL}/settings/customisation/brand-colours`);
  await expect(page.locator(".note")).toContainText("Growth and up");
  await expect(page.getByRole("button", { name: "Forest" })).toBeDisabled();
  await expect.poll(action).not.toBe("#047857");
  // Review links too.
  const token = await frank.createSharedLink();
  const res = await page.request.post(`${APP_URL}/api/shared-review`, { data: { token } });
  expect((await res.json()).branding).toEqual({ theme: null, logo_url: null });

  await admin.from("agencies").update({ plan: "growth" }).eq("id", frank.agencyId);
  await page.reload();
  await expect(page.locator(".note", { hasText: "Growth and up" })).toHaveCount(0);
  await expect.poll(action).toBe("#047857");
  const res2 = await page.request.post(`${APP_URL}/api/shared-review`, { data: { token } });
  expect((await res2.json()).branding.theme).toMatchObject({ action: "#047857" });
});

test("Account URL: an Owner on Agency changes it, the old address redirects, and nobody else can take it", async ({
  page,
  frank,
}) => {
  const old = `e2eo${Date.now().toString(36)}`;
  const next = `e2ep${Date.now().toString(36)}`;
  await admin.from("agencies").update({ subdomain: old }).eq("id", frank.agencyId);
  await frank.loginAsStaff(page); // an Admin, on Starter

  await page.goto(`${APP_URL}/settings/general/account-url`);
  await expect(page.getByText("comes with the Agency plan")).toBeVisible();
  await expect(page.locator("#acctSub")).toHaveCount(0);

  await admin.from("agencies").update({ plan: "agency" }).eq("id", frank.agencyId);
  await page.reload();
  await expect(page.getByText("Only an Owner or the Primary Owner can change the address.")).toBeVisible();
  const refused = await page.request.post(`${APP_URL}/api/agency/address`, { data: { agencyId: frank.agencyId, subdomain: next } });
  expect(refused.status()).toBe(403);

  await setRole(frank, "owner");
  await page.reload();
  await page.locator("#acctSub").fill("admin");
  await page.getByRole("button", { name: "Change", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Change Address" }).click();
  await expect(page.getByRole("dialog")).toContainText("isn't allowed");
  await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
  await page.locator("#acctSub").fill(next);
  await page.getByRole("button", { name: "Change", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText(`moves to ${next}.beingfrank.app`);
  await page.getByRole("dialog").getByRole("button", { name: "Change Address" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect((await admin.from("agencies").select("subdomain").eq("id", frank.agencyId).single()).data!.subdomain).toBe(next);

  // The old address leads to the new one, path and all.
  const r = await page.request.get(`http://${old}.frank.localhost:3000/review/abc`, { maxRedirects: 0 });
  expect(r.status()).toBe(308);
  expect(r.headers().location).toBe(`http://${next}.frank.localhost:3000/review/abc`);
  // And it stays this agency's.
  const squat = await admin.from("agencies").insert({ name: "E2E Squatter", subdomain: old }).select("id");
  expect(squat.error?.message).toContain("previously used by another agency");
});
