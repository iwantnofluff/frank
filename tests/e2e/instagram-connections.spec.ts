import { createClient } from "@supabase/supabase-js";
import { test, expect, APP_URL, type Frank } from "./fixtures";

// A client's Instagram, for the live feed (phase54). Instagram itself can't
// be reached from a test, and Frank's Meta app isn't set up locally, so
// connections are seeded and everything around them is checked: the
// Connections page, the Feed Preview's states, the client's connect link,
// the sign-in's refusals, and that nobody can read a token.

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function setStaffRole(frank: Frank, role: string) {
  const id = (await admin.from("users").select("id").eq("email", frank.staffEmail).single()).data!.id;
  await admin.from("memberships").update({ role }).eq("agency_id", frank.agencyId).eq("user_id", id);
}

async function seedConnection(frank: Frank, needsReconnect = false) {
  const { data: conn } = await admin
    .from("instagram_connections")
    .insert({
      client_id: frank.clientId,
      ig_user_id: "17841400000000000",
      username: "e2e_brand",
      followers_count: 1234,
      media_count: 56,
      connected_by_name: "E2E Staff",
      needs_reconnect_at: needsReconnect ? new Date().toISOString() : null,
    })
    .select("id")
    .single();
  await admin.from("instagram_tokens").insert({
    connection_id: conn!.id,
    token_encrypted: "not-a-real-token",
    expires_at: new Date(Date.now() + 50 * 24 * 3600_000).toISOString(),
  });
  return conn!.id as string;
}

test("the Connections page lists each client's account; an Owner disconnects one", async ({ page, frank }) => {
  test.setTimeout(60_000);
  const connectionId = await seedConnection(frank);
  await setStaffRole(frank, "owner");
  await frank.loginAsStaff(page);
  await page.goto(`${APP_URL}/settings/connections`);
  await page.waitForURL(/\/settings\/connections\/instagram$/);
  const row = page.getByRole("region", { name: "Instagram accounts" }).locator(".srow", { hasText: "E2E Test Client" });
  await expect(row).toContainText("@e2e_brand · 1,234 followers · connected by E2E Staff");
  await expect(row.locator(".tag")).toHaveText("Connected");
  // With Frank's Meta app set up here, Reconnect sends an Owner to
  // Instagram's own sign-in: Frank's app, read-only scope, the root
  // address's callback, and a signed state. Not followed: no Instagram call.
  const configured = (await (await page.request.get(`${APP_URL}/api/connections/instagram/status`)).json()).configured;
  if (configured) {
    const href = await row.getByRole("link", { name: "Reconnect" }).getAttribute("href");
    const start = await page.request.get(`${APP_URL}${href}`, { maxRedirects: 0 });
    expect(start.status()).toBe(307);
    const to = new URL(start.headers()["location"]);
    expect(to.origin + to.pathname).toBe("https://www.instagram.com/oauth/authorize");
    expect(to.searchParams.get("client_id")).toBe(process.env.INSTAGRAM_APP_ID);
    expect(to.searchParams.get("scope")).toBe("instagram_business_basic");
    // Tests run on a plain address, so the callback is that same address;
    // on an agency address it is the environment's root.
    expect(to.searchParams.get("redirect_uri")).toBe(`${APP_URL}/api/connections/instagram/callback`);
    expect(to.searchParams.get("state")).toMatch(/^[\w-]+\.[\w-]+$/);
    // Not through Instagram's login pages (that broke the code exchange).
    expect(to.searchParams.get("force_reauth")).toBeNull();
  } else {
    await expect(page.getByText(/Instagram isn.t set up on Frank here yet/)).toBeVisible();
    await expect(row.getByRole("link", { name: /Connect|Reconnect/ })).toHaveCount(0);
  }
  await page.screenshot({ path: `${process.env.SHOT_DIR ?? "test-results"}/ig-connections.png`, animations: "disabled" });

  await row.getByRole("button", { name: "Disconnect" }).click();
  await expect(row).toContainText("Not connected");
  expect((await admin.from("instagram_connections").select("id").eq("client_id", frank.clientId)).data).toEqual([]);
  // The token went with it.
  expect((await admin.from("instagram_tokens").select("connection_id").eq("connection_id", connectionId)).data).toEqual([]);
});

test("the Feed Preview says how to connect, or that the account needs reconnecting", async ({ page, frank }) => {
  test.setTimeout(60_000);
  await frank.loginAsStaff(page);
  await page.goto(`${APP_URL}/creatives/${frank.creativeId}`);
  await page.getByRole("button", { name: "Feed Preview" }).click();
  await expect(page.locator(".fp-note")).toHaveText(
    "Connect E2E Test Client's Instagram in Settings → Connections to show its real posts here.",
  );
  await expect(page.locator(".feedgrid-tile-empty").first()).toContainText("Live Post");

  await seedConnection(frank, true);
  await page.reload();
  await page.getByRole("button", { name: "Feed Preview" }).click();
  await expect(page.locator(".fp-note")).toHaveText(
    "@e2e_brand needs reconnecting in Settings → Connections to show its real posts.",
  );
});

test("an Owner sends the client a connect link; it says who's asking, and works once", async ({ page, browser, frank }) => {
  test.setTimeout(60_000);
  await setStaffRole(frank, "owner");
  await frank.loginAsStaff(page);
  const res = await page.request.post(`${APP_URL}/api/clients/${frank.clientId}/instagram/link`);
  expect(res.status()).toBe(200);
  const { url } = await res.json();
  expect(url).toMatch(/\/connect\/instagram\/[\w-]+$/);

  const ctx = await browser.newContext();
  try {
    const guest = await ctx.newPage();
    await guest.goto(url);
    await expect(guest.getByRole("heading", { name: "Connect E2E Test Client Instagram" })).toBeVisible();
    await expect(guest.getByText("Frank never sees your password")).toBeVisible();
    await expect(guest.getByRole("link", { name: "Connect with Instagram" })).toHaveAttribute(
      "href",
      /\/api\/connections\/instagram\/start\?link=/,
    );
    // Used: the page says so.
    await admin.from("instagram_connect_links").update({ used_at: new Date().toISOString() }).eq("client_id", frank.clientId);
    await guest.reload();
    await expect(guest.getByRole("heading", { name: "This link has been used" })).toBeVisible();
  } finally {
    await ctx.close();
  }

  // An Admin can make one too; a User can't.
  await setStaffRole(frank, "user");
  const asUser = await page.request.post(`${APP_URL}/api/clients/${frank.clientId}/instagram/link`);
  expect(asUser.status()).toBe(403);
});

test("the sign-in refuses a forged return, and nobody but the server reads a token", async ({ page, frank }) => {
  await seedConnection(frank);
  // Instagram coming back, at the root address, with a state Frank didn't
  // sign.
  const forged = await page.request.get(`http://frank.localhost:3000/api/connections/instagram/callback?code=x&state=bm90.c2lnbmVk`, {
    maxRedirects: 0,
  });
  expect(forged.status()).toBe(400);

  // Staff see the connection, never its token.
  const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });
  await c.auth.signInWithPassword({ email: frank.staffEmail, password: frank.staffPassword });
  expect((await c.from("instagram_connections").select("username")).data).toEqual([{ username: "e2e_brand" }]);
  expect((await c.from("instagram_tokens").select("*")).data ?? []).toHaveLength(0);
  // A Client sees neither.
  const cl = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });
  await cl.auth.signInWithPassword({ email: frank.clientEmail, password: frank.clientPassword });
  expect((await cl.from("instagram_connections").select("id")).data ?? []).toHaveLength(0);
});

test("a review link offers Feed only with a working connection, and never shows a broken one", async ({ browser, frank }) => {
  test.setTimeout(60_000);
  const token = await frank.createSharedLink();
  const ctx = await browser.newContext();
  try {
    const guest = await ctx.newPage();
    // Nothing connected: the post as before, no switch.
    await guest.goto(`${APP_URL}/review/${token}`);
    await guest.waitForSelector(".m-top");
    await expect(guest.getByRole("group", { name: "View" })).toHaveCount(0);

    // A made-up link, or a connection that needs reconnecting: nothing.
    const bad = await guest.request.post(`${APP_URL}/api/shared-review/instagram`, { data: { token: "nope" } });
    expect(await bad.json()).toEqual({ status: "not_connected" });
    await seedConnection(frank, true);
    const broken = await guest.request.post(`${APP_URL}/api/shared-review/instagram`, { data: { token } });
    expect(await broken.json()).toEqual({ status: "not_connected" });
    await guest.reload();
    await guest.waitForSelector(".m-top");
    await expect(guest.getByRole("group", { name: "View" })).toHaveCount(0);
  } finally {
    await ctx.close();
  }
});

// Meta's callbacks, at the root address, as Meta sends them: a form with a
// signed_request signed with the app secret.
function signedRequest(userId: string, secret = process.env.INSTAGRAM_APP_SECRET!) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createHmac } = require("node:crypto") as typeof import("node:crypto");
  const payload = Buffer.from(JSON.stringify({ algorithm: "HMAC-SHA256", issued_at: 1, user_id: userId })).toString("base64url");
  return `${createHmac("sha256", secret).update(payload).digest("base64url")}.${payload}`;
}

test("Meta's deauthorize and data deletion callbacks remove the account, and need Meta's signature", async ({ page, frank }) => {
  test.skip(!process.env.INSTAGRAM_APP_SECRET, "needs Frank's Meta app secret");
  const ROOT = "http://frank.localhost:3000";
  await seedConnection(frank);
  // Unsigned (or signed with anything else): refused, nothing removed.
  const forged = await page.request.post(`${ROOT}/api/connections/instagram/deauthorize`, {
    form: { signed_request: signedRequest("17841400000000000", "not-the-secret") },
  });
  expect(forged.status()).toBe(400);
  expect((await admin.from("instagram_connections").select("id").eq("client_id", frank.clientId)).data).toHaveLength(1);

  const deauth = await page.request.post(`${ROOT}/api/connections/instagram/deauthorize`, {
    form: { signed_request: signedRequest("17841400000000000") },
  });
  expect(deauth.status()).toBe(200);
  expect((await admin.from("instagram_connections").select("id").eq("client_id", frank.clientId)).data).toEqual([]);

  // Data deletion: deleted, with a page and code for Meta to show.
  await seedConnection(frank);
  const del = await page.request.post(`${ROOT}/api/connections/instagram/data-deletion`, {
    form: { signed_request: signedRequest("17841400000000000") },
  });
  const body = await del.json();
  expect(body.confirmation_code).toMatch(/^[0-9a-f]{16}$/);
  expect((await admin.from("instagram_connections").select("id").eq("client_id", frank.clientId)).data).toEqual([]);
  await page.goto(body.url);
  await expect(page.getByRole("heading", { name: "Your Instagram data is deleted" })).toBeVisible();
  await expect(page.getByText(`Confirmation code: ${body.confirmation_code}.`)).toBeVisible();
});
