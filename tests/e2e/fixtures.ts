import { test as base, expect, type Cookie, type Page } from "@playwright/test";
import { CURRENT_RELEASE } from "../../lib/releases";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { admin, ANON_KEY, SUPABASE_URL, sweepAgency, TEST_AGENCY_NAME } from "./sweep";

export const APP_URL = "http://localhost:3000";
// A phone's screen: a review link opened at this size gets the phone
// layout, as on a real phone (anything 900px or wider gets the desktop one).
export const PHONE_VIEWPORT = { width: 390, height: 844 };

// The fixture's two sign-in accounts are reused, not made per test
// (decided directly, 25 Oct 2026): making and deleting two accounts for
// each of ~290 tests overwhelmed staging's sign-in service. Each parallel
// slot (workers in playwright.config.ts) has its own pair, made once;
// every test still gets a new workspace and fresh rows in users, so only
// the sign-in account itself carries over. A run's slots are named by
// E2E_POOL ("suite" by default), so a second run at the same time (a
// throwaway spec while the suite runs) sets its own and doesn't share.
const POOL = process.env.E2E_POOL ?? "suite";
const STAFF_PASSWORD = "E2e-Staff-Test-1234!";
const CLIENT_PASSWORD = "E2e-Client-Test-1234!";
const poolEmail = (slot: number, who: "staff" | "client") => `e2e-pool-${POOL}-${slot}-${who}@example.invalid`;
const isPoolEmail = (email: string) => email.startsWith("e2e-pool-");

// The slot's accounts' ids, once found, for the rest of this worker.
const known = new Map<string, string>();

// The account's id: signing in finds it; failing that, it's made, or if
// it's there with another password (a spec changed it), put right.
async function poolAccount(email: string, password: string): Promise<string> {
  const cached = known.get(email);
  if (cached) return cached;
  const probe = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const signedIn = await probe.auth.signInWithPassword({ email, password });
  let id = signedIn.data.user?.id;
  if (!id) {
    const made = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    id = made.data.user?.id;
    if (!id) {
      // Already there: find it and reset its password.
      for (let page = 1; !id && page <= 20; page++) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
        if (error) throw error;
        id = data.users.find((u) => u.email === email)?.id;
        if (data.users.length < 1000) break;
      }
      if (!id) throw made.error ?? new Error(`Couldn't make or find ${email}`);
      const { error } = await admin.auth.admin.updateUserById(id, { password, ban_duration: "none" });
      if (error) throw error;
    }
  } else {
    await probe.auth.signOut({ scope: "local" });
  }
  known.set(email, id);
  return id;
}

// Anything a stopped run left on this slot's accounts: their test
// workspaces (swept whole) and their rows in users, so the test starts
// from nothing.
async function clearSlot(ids: string[]) {
  const { data: rows } = await admin
    .from("memberships")
    .select("agency_id, agency:agencies(name)")
    .in("user_id", ids);
  const left = new Set(
    (rows ?? [])
      .filter((r) => (r.agency as unknown as { name: string } | null)?.name === TEST_AGENCY_NAME)
      .map((r) => r.agency_id as string),
  );
  for (const agencyId of left) await sweepAgency(agencyId);
  await admin.from("users").delete().in("id", ids);
}

export interface Frank {
  agencyId: string;
  clientId: string;
  projectId: string;
  creativeId: string;
  staffEmail: string;
  staffPassword: string;
  clientEmail: string;
  clientPassword: string;
  loginAsStaff(page: Page): Promise<void>;
  loginAsClient(page: Page): Promise<void>;
  /**
   * Inserts a comment through a real authenticated staff session, not the
   * service-role client. This matters: comments_enforce_visibility()
   * (supabase/seed.sql) checks is_agency_staff(agency_id), which checks
   * auth.uid() — the service-role client has none, so it would silently
   * coerce `visibility` to 'public' regardless of what's asked for here.
   * See frank-conventions and docs/comment-visibility-verification.md.
   * Returns the inserted comment's id.
   */
  insertCommentAsStaff(body: string, visibility: "private" | "public"): Promise<string>;
  /** Inserts a shared_links row directly (not subject to the visibility
   * trigger, safe to seed via service role) and returns its token. */
  createSharedLink(opts?: { canApprove?: boolean }): Promise<string>;
  /** Inserts a client_contacts row directly for the default client — for
   * shared-review-public.spec.ts, which needs a real Client Team entry to
   * exercise the guest identity picker on /review/[token]. Cleaned up by
   * the same agency_id-wide teardown. */
  createClientContact(name: string, email: string): Promise<string>;
  /** Reads the default (scheduled) project's own creative's stage/exception
   * directly — for shared-review-public.spec.ts, confirming a guest's
   * "Make Changes" action set a real status, not just a comment. */
  getCreativeStatus(): Promise<{ stage: number; exception: string | null }>;
  /** Reads a comment by its exact body text, on the default fixture
   * creative — for confirming a fire-and-forget classify-comment request
   * really names the row that was just posted, not just some id. */
  getCommentByBody(body: string): Promise<{ id: string; issue_category: string | null } | null>;
  /** Creates an extra continuous-delivery project for the same client,
   * for specs that specifically need one (new-brief.spec.ts) — not part
   * of the base fixture, so the other ~25 specs asserting against "1
   * project" for this client don't silently start seeing 2. Cleaned up by
   * the agency_id-wide teardown below, no separate tracking needed. */
  createContinuousProject(): Promise<string>;
  /** Creates an extra creative on the default (scheduled) project at a
   * given stage — for share-eligibility.spec.ts, which needs creatives
   * below Client Review (stage < 4) to exercise ShareModal's eligibility
   * preview. Cleaned up by the same agency_id-wide teardown. */
  createCreativeAtStage(stage: number, name?: string): Promise<string>;
  /** Creates a creative directly in a given (continuous-delivery) project —
   * for continuous-calendar.spec.ts, which needs real due_on/stage/cx data
   * to seed ContinuousCalendarTable rather than going through the New
   * Brief form every time. Cleaned up by the same agency_id-wide
   * teardown. */
  createContinuousCreative(
    projectId: string,
    fields: {
      name?: string;
      dueOn?: string;
      destination?: string;
      stage?: number;
      cx?: Record<string, string | number | boolean | null>;
    },
  ): Promise<string>;
  /** Inserts a copy_versions row directly (service-role, no author-
   * dependent visibility rule here unlike comments) — for
   * project-calendar.spec.ts's Image on Text / Post Copy version-history
   * hover, which needs more than one version on record to have anything
   * to show. Cleaned up by the same agency_id-wide teardown. */
  createCopyVersion(
    creativeId: string,
    versionNo: number,
    fields: { caption: string },
  ): Promise<void>;
  /** A creative version whose file is named `filename` — an assets row
   * only, no file in storage (the table's Creative column shows the name;
   * the preview just has nothing to draw). Same agency_id-wide teardown. */
  createArtworkVersion(creativeId: string, versionNo: number, filename: string): Promise<void>;
  /** Says this spec changed a fixture account's password (or anything
   * else on the sign-in account), so the teardown puts it back for the
   * next test on this slot's reused accounts. */
  accountsChanged(): void;
}

// Signed in once per account, not per test (decided directly, 25 Oct
// 2026): staging's sign-in rate limit counts every sign-in from this
// machine, and a faster suite reached it. The page's session cookies and a
// signed-in client are kept for the rest of the worker; a saved session
// that no longer works (expired, or its account was put right) is
// dropped and the account signs in again.
const pageSessions = new Map<string, Cookie[]>();
const clientSessions = new Map<string, SupabaseClient>();

async function signIn(email: string, password: string): Promise<SupabaseClient> {
  const kept = clientSessions.get(email);
  // Asked of the server, not the kept copy: another test signing this
  // account out ends every session it has.
  if (kept && (await kept.auth.getUser()).data.user) return kept;
  const client = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  clientSessions.set(email, client);
  return client;
}

// To the dashboard signed in: on the kept session if it still works,
// otherwise through the sign-in page, as before, keeping that session.
async function signInPage(page: Page, email: string, password: string) {
  const kept = pageSessions.get(email);
  if (kept) {
    await page.context().addCookies(kept);
    await page.goto(`${APP_URL}/dashboard`);
    if (new URL(page.url()).pathname === "/dashboard") return;
    pageSessions.delete(email);
    await page.context().clearCookies();
  }
  await page.goto(`${APP_URL}/login`);
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(`${APP_URL}/dashboard`, { timeout: 15000 });
  pageSessions.set(email, (await page.context().cookies()).filter((c) => c.name.startsWith("sb-")));
}

export const test = base.extend<{ frank: Frank }>({
  frank: async ({}, provideFixture, testInfo) => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const slot = testInfo.parallelIndex;
    const staffEmail = poolEmail(slot, "staff");
    const staffPassword = STAFF_PASSWORD;
    const clientEmail = poolEmail(slot, "client");
    const clientPassword = CLIENT_PASSWORD;

    const staffAuth = { user: { id: await poolAccount(staffEmail, staffPassword) } };
    const clientAuth = { user: { id: await poolAccount(clientEmail, clientPassword) } };
    await clearSlot([staffAuth.user.id, clientAuth.user.id]);
    // Set when a spec changes an account's password, so it's put back.
    let accountsChanged = false;

    const { data: agency, error: agencyError } = await admin
      .from("agencies")
      // Starter, as every agency was before phase41 made new ones Free: a
      // paid plan, so never read-only. Roomy limits (phase37 enforces
      // them), so specs that add members or clients don't trip over the
      // plan's: Starter's 3 clients and 5 members, plus an admin override
      // (phase42) taking both to 50.
      .insert({ name: TEST_AGENCY_NAME, plan: "starter", extra_clients: 47, extra_seats: 45 })
      .select("id")
      .single();
    if (agencyError) throw agencyError;

    const usersRows = [
      // Today's update already seen, so the bell's count (and screenshots)
      // don't hang on when that check loads; updates.spec clears it. Tips
      // off (phase116), so none slides over what a test clicks; tips.spec
      // turns them on.
      { id: staffAuth.user.id, email: staffEmail, name: "E2E Staff", releases_seen: CURRENT_RELEASE.version, tips_every_hours: 0 },
      { id: clientAuth.user.id, email: clientEmail, name: "E2E Client User" },
    ];
    // A field one row leaves out takes its default, not null.
    let { error: usersError } = await admin.from("users").insert(usersRows, { defaultToNull: false });
    if (usersError?.code === "23503") {
      // An account a spec deleted through the app: made again.
      known.delete(staffEmail);
      known.delete(clientEmail);
      usersRows[0].id = staffAuth.user.id = await poolAccount(staffEmail, staffPassword);
      usersRows[1].id = clientAuth.user.id = await poolAccount(clientEmail, clientPassword);
      ({ error: usersError } = await admin.from("users").insert(usersRows, { defaultToNull: false }));
    }
    if (usersError) throw usersError;

    const { data: client, error: clientError } = await admin
      .from("clients")
      .insert({ agency_id: agency.id, name: "E2E Test Client" })
      .select("id")
      .single();
    if (clientError) throw clientError;

    await admin.from("memberships").insert([
      { agency_id: agency.id, user_id: staffAuth.user.id, role: "admin" },
      { agency_id: agency.id, user_id: clientAuth.user.id, client_id: client.id, role: "user" },
    ]);
    // A Client membership puts its person on the client's review-link list
    // (phase45). Specs start with that list empty, as they always have, and
    // add to it on purpose (createClientContact) or by inviting a Client.
    await admin.from("client_contacts").delete().eq("client_id", client.id);

    const { data: project, error: projectError } = await admin
      .from("projects")
      .insert({ client_id: client.id, name: "E2E Test Project", delivery: "scheduled" })
      .select("id")
      .single();
    if (projectError) throw projectError;

    // stage: 4 (Client Review) so the fixture creative is eligible for a
    // shared link in any spec that needs one (stage < 4 is excluded from
    // shared review unconditionally — see shared_link_allowed_creative_ids).
    const { data: creative, error: creativeError } = await admin
      .from("creatives")
      .insert({
        project_id: project.id,
        name: "E2E Test Creative",
        format: "ig_feed",
        stage: 4,
        // Fixed, not Date.now()-relative — the page renders this with
        // exact hour:minute via toLocaleString, so a relative timestamp
        // makes the screenshot's text non-deterministic between runs and
        // fails toHaveScreenshot on nothing but wall-clock drift.
        scheduled_at: "2027-03-15T14:00:00.000Z",
        created_by: staffAuth.user.id,
      })
      .select("id")
      .single();
    if (creativeError) throw creativeError;

    const commentIds: string[] = [];
    const sharedLinkTokens: string[] = [];

    const frank: Frank = {
      agencyId: agency.id,
      clientId: client.id,
      projectId: project.id,
      creativeId: creative.id,
      staffEmail,
      staffPassword,
      clientEmail,
      clientPassword,

      async loginAsStaff(page: Page) {
        await signInPage(page, staffEmail, staffPassword);
      },

      async loginAsClient(page: Page) {
        await signInPage(page, clientEmail, clientPassword);
      },

      async insertCommentAsStaff(body, visibility) {
        const staffClient = await signIn(staffEmail, staffPassword);
        const {
          data: { user },
        } = await staffClient.auth.getUser();
        const { data, error } = await staffClient
          .from("comments")
          .insert({ creative_id: creative.id, author_id: user!.id, body, visibility })
          .select("id, visibility")
          .single();
        if (error) throw error;
        if (data.visibility !== visibility) {
          throw new Error(
            `Inserted comment landed as visibility=${data.visibility}, expected ${visibility} — comments_enforce_visibility() coerced it, which means this session wasn't recognised as staff.`,
          );
        }
        commentIds.push(data.id);
        return data.id as string;
      },

      async createSharedLink(opts) {
        const token = `e2e-${stamp}-${sharedLinkTokens.length}`;
        const { error } = await admin.from("shared_links").insert({
          agency_id: agency.id,
          project_id: project.id,
          token,
          scope: "all",
          requires_passcode: false,
          passcode_hash: null,
          can_approve: opts?.canApprove ?? false,
          created_by: staffAuth.user.id,
        });
        if (error) throw error;
        sharedLinkTokens.push(token);
        return token;
      },

      async createClientContact(name, email) {
        const { data, error } = await admin
          .from("client_contacts")
          .insert({ agency_id: agency.id, client_id: client.id, name, email })
          .select("id")
          .single();
        if (error) throw error;
        return data.id as string;
      },

      async getCreativeStatus() {
        const { data, error } = await admin
          .from("creatives")
          .select("stage, exception")
          .eq("id", creative.id)
          .single();
        if (error) throw error;
        return data;
      },

      async getCommentByBody(body: string) {
        const { data, error } = await admin
          .from("comments")
          .select("id, issue_category")
          .eq("creative_id", creative.id)
          .eq("body", body)
          .maybeSingle();
        if (error) throw error;
        return data;
      },

      async createContinuousProject() {
        const { data, error } = await admin
          .from("projects")
          .insert({ client_id: client.id, name: `E2E Continuous Project ${stamp}`, delivery: "continuous" })
          .select("id")
          .single();
        if (error) throw error;
        return data.id as string;
      },

      async createCreativeAtStage(stage, name = `E2E Stage ${stage} Creative ${stamp}`) {
        const { data, error } = await admin
          .from("creatives")
          .insert({
            project_id: project.id,
            name,
            format: "ig_feed",
            stage,
            scheduled_at: "2027-03-15T14:00:00.000Z",
            created_by: staffAuth.user.id,
          })
          .select("id")
          .single();
        if (error) throw error;
        return data.id as string;
      },

      async createContinuousCreative(projectId, fields) {
        const { data, error } = await admin
          .from("creatives")
          .insert({
            project_id: projectId,
            name: fields.name ?? `E2E Continuous Creative ${stamp}`,
            format: "ig_feed",
            stage: fields.stage ?? 1,
            due_on: fields.dueOn ?? null,
            destination: fields.destination ?? "https://example.com/listing",
            cx: fields.cx ?? {},
            created_by: staffAuth.user.id,
          })
          .select("id")
          .single();
        if (error) throw error;
        return data.id as string;
      },

      async createCopyVersion(creativeId, versionNo, fields) {
        const { error } = await admin.from("copy_versions").insert({
          creative_id: creativeId,
          version_no: versionNo,
          // A version is copy only (phase57); Text on Image is on the post.
          fields: { caption: fields.caption },
          source: "in_app_edit",
          created_by: staffAuth.user.id,
        });
        if (error) throw error;
      },

      accountsChanged() {},

      async createArtworkVersion(creativeId, versionNo, filename) {
        const { data: asset, error: assetError } = await admin
          .from("assets")
          .insert({
            agency_id: agency.id,
            storage_key: `${agency.id}/${creativeId}/${crypto.randomUUID()}-${filename}`,
            filename,
            mime_type: "image/png",
            bytes: 1,
            created_by: staffAuth.user.id,
          })
          .select("id")
          .single();
        if (assetError) throw assetError;
        const { error } = await admin
          .from("creative_versions")
          .insert({ creative_id: creativeId, version_no: versionNo, asset_id: asset.id, created_by: staffAuth.user.id });
        if (error) throw error;
      },
    };

    frank.accountsChanged = () => {
      accountsChanged = true;
    };

    await provideFixture(frank);

    // Teardown: the workspace and everything in it (sweep.ts), then the
    // people's rows. Accounts a spec invited into this agency
    // (team-invite.spec.ts) go too, never the slot's own two, which stay
    // for the next test. Restricted to the reserved .invalid domain so a
    // real account can never be swept, whatever a spec did.
    const { data: invitedRows } = await admin
      .from("memberships")
      .select("user_id, user:users!memberships_user_id_fkey(email)")
      .eq("agency_id", agency.id);
    const invitedUserIds = (invitedRows ?? [])
      .filter((r) => {
        const u = r.user as unknown as { email: string } | null;
        return (
          r.user_id !== staffAuth.user.id &&
          r.user_id !== clientAuth.user.id &&
          !!u?.email.endsWith("@example.invalid") &&
          !isPoolEmail(u.email)
        );
      })
      .map((r) => r.user_id as string);

    await sweepAgency(agency.id);
    const { error: usersDeleteError } = await admin
      .from("users")
      .delete()
      .in("id", [staffAuth.user.id, clientAuth.user.id, ...invitedUserIds]);
    if (usersDeleteError) console.error("Cleanup failed at users:", usersDeleteError);
    if (accountsChanged) {
      for (const email of [staffEmail, clientEmail]) {
        pageSessions.delete(email);
        clientSessions.delete(email);
      }
      await admin.auth.admin.updateUserById(staffAuth.user.id, { password: staffPassword, ban_duration: "none" });
      await admin.auth.admin.updateUserById(clientAuth.user.id, { password: clientPassword, ban_duration: "none" });
    }
    for (const id of invitedUserIds) await admin.auth.admin.deleteUser(id);
  },
});

export { expect };

/** Steps a calendar forward to the given month header (e.g. "March 2027").
 * Not a fixed number of Next clicks: those counted from whatever month it
 * was when written, and broke every calendar spec when the date rolled
 * over a month. */
export async function goToMonth(page: Page, label: string) {
  const header = page.locator(".calmonth");
  await expect(header).toBeVisible();
  for (let i = 0; i < 60; i++) {
    const current = (await header.textContent())?.trim();
    if (current === label) return;
    await page.click('.calnav button[title="Next"]');
    await expect(header).not.toHaveText(current ?? "");
  }
  throw new Error(`Calendar never reached ${label}`);
}

// A new post starts with no format (direct instruction): tick one in the
// post window's Format picker and close it with Done.
export async function chooseFormat(page: import("@playwright/test").Page, label = "Instagram Post") {
  await page.click("#nbFmt");
  const pop = page.getByRole("dialog", { name: "Formats" });
  await pop.getByRole("checkbox", { name: label }).click();
  await pop.getByRole("button", { name: "Done" }).click();
  await pop.waitFor({ state: "detached" });
}

// The tables' status filter (multi-choice, direct instruction): shows only
// the statuses named, by their labels ("0. Idea", "4. Client Review").
export async function showStatuses(page: import("@playwright/test").Page, labels: string[]) {
  await page.getByRole("button", { name: "Status" }).click();
  const pop = page.getByRole("dialog", { name: "Statuses" });
  const all = pop.getByRole("checkbox", { name: "All Statuses" });
  // From none: tick All (if it isn't already) and untick it again.
  if ((await all.getAttribute("aria-checked")) !== "true") await all.click();
  await all.click();
  for (const l of labels) await pop.getByRole("checkbox", { name: l, exact: true }).click();
  await pop.getByRole("button", { name: "Done" }).click();
}
