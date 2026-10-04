import { test as base, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import path from "path";

// Playwright's runner doesn't load .env.local the way `next dev` does.
process.loadEnvFile(path.resolve(__dirname, "../../.env.local"));

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
export const APP_URL = "http://localhost:3000";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

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
   * below Client Review (stage < 3) to exercise ShareModal's eligibility
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
    fields: { caption?: string; slideText?: string[] },
  ): Promise<void>;
}

async function signIn(email: string, password: string): Promise<SupabaseClient> {
  const client = createClient(SUPABASE_URL, ANON_KEY);
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return client;
}

export const test = base.extend<{ frank: Frank }>({
  frank: async ({}, provideFixture) => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const staffEmail = `e2e-staff-${stamp}@example.invalid`;
    const staffPassword = "E2e-Staff-Test-1234!";
    const clientEmail = `e2e-client-${stamp}@example.invalid`;
    const clientPassword = "E2e-Client-Test-1234!";

    const { data: staffAuth, error: staffAuthError } = await admin.auth.admin.createUser({
      email: staffEmail,
      password: staffPassword,
      email_confirm: true,
    });
    if (staffAuthError || !staffAuth.user) throw staffAuthError ?? new Error("No staff user");

    const { data: clientAuth, error: clientAuthError } = await admin.auth.admin.createUser({
      email: clientEmail,
      password: clientPassword,
      email_confirm: true,
    });
    if (clientAuthError || !clientAuth.user) throw clientAuthError ?? new Error("No client user");

    const { data: agency, error: agencyError } = await admin
      .from("agencies")
      // Starter, as every agency was before phase41 made new ones Free: a
      // paid plan, so never read-only. Roomy limits (phase37 enforces
      // them), so specs that add members or clients don't trip over the
      // plan's: Starter's 3 clients and 5 members, plus an admin override
      // (phase42) taking both to 50.
      .insert({ name: "E2E Test Agency", plan: "starter", extra_clients: 47, extra_seats: 45 })
      .select("id")
      .single();
    if (agencyError) throw agencyError;

    await admin.from("users").insert([
      { id: staffAuth.user.id, email: staffEmail, name: "E2E Staff" },
      { id: clientAuth.user.id, email: clientEmail, name: "E2E Client User" },
    ]);

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

    // stage: 3 (Client Review) so the fixture creative is eligible for a
    // shared link in any spec that needs one (stage < 3 is excluded from
    // shared review unconditionally — see shared_link_allowed_creative_ids).
    const { data: creative, error: creativeError } = await admin
      .from("creatives")
      .insert({
        project_id: project.id,
        name: "E2E Test Creative",
        format: "ig_feed",
        stage: 3,
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
        await page.goto(`${APP_URL}/login`);
        await page.fill('input[type="email"]', staffEmail);
        await page.fill('input[type="password"]', staffPassword);
        await page.click('button[type="submit"]');
        await page.waitForURL(`${APP_URL}/dashboard`, { timeout: 15000 });
      },

      async loginAsClient(page: Page) {
        await page.goto(`${APP_URL}/login`);
        await page.fill('input[type="email"]', clientEmail);
        await page.fill('input[type="password"]', clientPassword);
        await page.click('button[type="submit"]');
        await page.waitForURL(`${APP_URL}/dashboard`, { timeout: 15000 });
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
        await staffClient.auth.signOut();
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
          fields: fields.caption ? { caption: fields.caption } : {},
          slide_text: fields.slideText ?? [],
          source: "in_app_edit",
          created_by: staffAuth.user.id,
        });
        if (error) throw error;
      },
    };

    await provideFixture(frank);

    // Teardown, reverse dependency order. Best-effort — logged, not thrown,
    // so one failure doesn't stop the rest of cleanup from running.
    //
    // By agency_id throughout, not by the specific ids created above —
    // every agency-scoped table has that column (denormalised for RLS),
    // and specs are free to create their own extra creatives/copy versions
    // against either project (New Brief's spec cases do exactly that).
    // Tracking each such row individually here would be one more thing to
    // remember per spec; agency_id sweeps all of it regardless of what a
    // test added.
    // Accounts a spec invited into this agency (team-invite.spec.ts) — never
    // the fixture's own two. Restricted to the reserved .invalid domain so a
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
          !!u?.email.endsWith("@example.invalid")
        );
      })
      .map((r) => r.user_id as string);

    const steps: [string, () => PromiseLike<{ error: unknown }>][] = [
      // By agency_id, not by the tokens tracked in sharedLinkTokens — that
      // array only sees links made via frank.createSharedLink(); one made
      // through the real ShareModal UI (share-eligibility.spec.ts) goes
      // through create_shared_link() instead and was never tracked,
      // which is exactly the gap that orphaned an agency here once already.
      ["shared_links", () => admin.from("shared_links").delete().eq("agency_id", agency.id)],
      ["comments", () => admin.from("comments").delete().eq("agency_id", agency.id)],
      ["copy_versions", () => admin.from("copy_versions").delete().eq("agency_id", agency.id)],
      ["creative_version_slides", () => admin.from("creative_version_slides").delete().eq("agency_id", agency.id)],
      ["creative_versions", () => admin.from("creative_versions").delete().eq("agency_id", agency.id)],
      // phase52: Claude conversations about a post's copy (cascade with it,
      // swept by name so a failure says so).
      ["copy_chat_messages", () => admin.from("copy_chat_messages").delete().eq("agency_id", agency.id)],
      ["copy_chats", () => admin.from("copy_chats").delete().eq("agency_id", agency.id)],
      ["creatives", () => admin.from("creatives").delete().eq("agency_id", agency.id)],
      ["custom_columns", () => admin.from("custom_columns").delete().eq("agency_id", agency.id)],
      // References projects and memberships (phase46). Both cascade to it,
      // but swept by name so a failure here says so.
      ["project_access", () => admin.from("project_access").delete().eq("agency_id", agency.id)],
      ["projects", () => admin.from("projects").delete().eq("agency_id", agency.id)],
      // No RLS delete policy exists for format_directions at all — even
      // staff can't remove one through the app — so a spec that adds one
      // (settings.spec.ts's catalog test) needs the service-role client to
      // clean it up, or agencies' delete below fails on the FK and leaves
      // this whole fixture orphaned.
      ["format_directions", () => admin.from("format_directions").delete().eq("agency_id", agency.id)],
      // Before phase11_agency_knowledge.sql is applied, this errors
      // (best-effort/logged, not thrown — same as every step here) rather
      // than blocking the rest of cleanup.
      ["agency_knowledge_entries", () => admin.from("agency_knowledge_entries").delete().eq("agency_id", agency.id)],
      // References clients — must run before the clients delete below, the
      // same reason format_directions/custom_columns run before agencies.
      ["knowledge_entries", () => admin.from("knowledge_entries").delete().eq("agency_id", agency.id)],
      // Both cascade from memberships anyway; swept explicitly so a failure
      // names the table instead of surfacing as a memberships FK error.
      ["invites", () => admin.from("invites").delete().eq("agency_id", agency.id)],
      ["staff_client_access", () => admin.from("staff_client_access").delete().eq("agency_id", agency.id)],
      // Points at users (requested_by); also goes with its agency (cascade).
      ["plan_requests", () => admin.from("plan_requests").delete().eq("agency_id", agency.id)],
      // Paddle's side of a plan (phase39); also goes with its agency (cascade).
      ["agency_billing", () => admin.from("agency_billing").delete().eq("agency_id", agency.id)],
      ["memberships", () => admin.from("memberships").delete().eq("agency_id", agency.id)],
      // References both agencies and users (created_by) — must run before
      // both deletes below, the same reason format_directions/
      // custom_columns run before clients/agencies. Never surfaced before
      // continuous-calendar.spec.ts: no earlier spec ever completed a real
      // "Save as New View" flow, only asserted the Save button's presence.
      ["calendar_views", () => admin.from("calendar_views").delete().eq("agency_id", agency.id)],
      // References clients — must run before the clients delete below, same
      // reason format_directions/custom_columns do.
      ["client_contacts", () => admin.from("client_contacts").delete().eq("agency_id", agency.id)],
      // References both clients (client_id) and users (created_by) — must
      // run before both deletes below, same reason format_directions/
      // custom_columns run before clients/agencies. projects.folder_id
      // itself needs no ordering against this (on delete set null).
      ["project_folders", () => admin.from("project_folders").delete().eq("agency_id", agency.id)],
      // By agency_id, not just the fixture's own client.id — new-client.spec.ts
      // creates extra clients through the real New Client modal, same reasoning
      // as shared_links above.
      ["clients", () => admin.from("clients").delete().eq("agency_id", agency.id)],
      // After clients (clients.logo_asset_id references assets) and after
      // every other table above that references assets (creative_versions,
      // knowledge_entries) — an asset row with anything still pointing at
      // it fails the same way an unswept child row anywhere else here does.
      // References agencies, and (logo_asset_id) assets — so before both.
      // Only exists once a spec saves branding (branding.spec.ts).
      ["agency_settings", () => admin.from("agency_settings").delete().eq("agency_id", agency.id)],
      // users.avatar_asset_id points at assets, so a profile photo set in a
      // spec has to be unlinked before the sweep below can delete it.
      [
        "users.avatar_asset_id",
        async () => {
          const { data: owned } = await admin.from("assets").select("id").eq("agency_id", agency.id);
          const ids = (owned ?? []).map((a) => a.id as string);
          if (ids.length === 0) return { error: null };
          return admin.from("users").update({ avatar_asset_id: null }).in("avatar_asset_id", ids);
        },
      ],
      ["assets", () => admin.from("assets").delete().eq("agency_id", agency.id)],
      // References both agencies and users — must run before both deletes
      // below, same reason format_directions/custom_columns do. Never
      // surfaced before real classify-comment-triggered AI calls existed:
      // no earlier spec logged a row here.
      ["ai_usage_events", () => admin.from("ai_usage_events").delete().eq("agency_id", agency.id)],
      // phase50: written by a trigger whenever a spec changes the plan.
      // Cascades with the agency, but swept by name so a failure says so.
      ["plan_changes", () => admin.from("plan_changes").delete().eq("agency_id", agency.id)],
      // phase51: the admin area's actions on this agency.
      ["admin_actions", () => admin.from("admin_actions").delete().eq("agency_id", agency.id)],
      // Retried, not a single attempt: a comment posted near the end of a
      // test fires a background classify-comment call, and if the AI reply
      // lands mid-teardown, its ai_usage_events row appears *after* the
      // sweep above and blocks this delete on the FK. Re-sweep and retry
      // until the agency is gone — once it is, any later usage insert just
      // fails its own FK harmlessly instead of orphaning anything.
      [
        "agencies",
        async () => {
          let result = await admin.from("agencies").delete().eq("id", agency.id);
          for (let attempt = 0; result.error && attempt < 10; attempt++) {
            await new Promise((r) => setTimeout(r, 1000));
            await admin.from("ai_usage_events").delete().eq("agency_id", agency.id);
            result = await admin.from("agencies").delete().eq("id", agency.id);
          }
          return result;
        },
      ],
      [
        "users",
        () => admin
            .from("users")
            .delete()
            .in("id", [staffAuth.user.id, clientAuth.user.id, ...invitedUserIds]),
      ],
    ];
    for (const [label, run] of steps) {
      const { error } = await run();
      if (error) console.error(`Cleanup failed at ${label}:`, error);
    }
    await admin.auth.admin.deleteUser(staffAuth.user.id);
    await admin.auth.admin.deleteUser(clientAuth.user.id);
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
