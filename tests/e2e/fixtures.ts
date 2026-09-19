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
  createSharedLink(): Promise<string>;
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
      .insert({ name: "E2E Test Agency" })
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

    const { data: project, error: projectError } = await admin
      .from("projects")
      .insert({ client_id: client.id, name: "E2E Test Project", delivery: "scheduled" })
      .select("id")
      .single();
    if (projectError) throw projectError;

    // stage: 5 so the fixture creative is eligible for a shared link in any
    // spec that needs one (stage < 5 is excluded from shared review
    // unconditionally — see shared_link_allowed_creative_ids).
    const { data: creative, error: creativeError } = await admin
      .from("creatives")
      .insert({
        project_id: project.id,
        name: "E2E Test Creative",
        format: "ig_feed",
        stage: 5,
        scheduled_at: new Date(Date.now() + 86400000).toISOString(),
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

      async createSharedLink() {
        const token = `e2e-${stamp}-${sharedLinkTokens.length}`;
        const { error } = await admin.from("shared_links").insert({
          agency_id: agency.id,
          project_id: project.id,
          token,
          scope: "all",
          requires_passcode: false,
          passcode_hash: null,
          can_approve: false,
          created_by: staffAuth.user.id,
        });
        if (error) throw error;
        sharedLinkTokens.push(token);
        return token;
      },
    };

    await provideFixture(frank);

    // Teardown, reverse dependency order. Best-effort — logged, not thrown,
    // so one failure doesn't stop the rest of cleanup from running.
    const steps: [string, () => PromiseLike<{ error: unknown }>][] = [
      ...sharedLinkTokens.map(
        (t): [string, () => PromiseLike<{ error: unknown }>] => [
          "shared_links",
          () => admin.from("shared_links").delete().eq("token", t),
        ],
      ),
      ["comments", () => admin.from("comments").delete().eq("creative_id", creative.id)],
      ["creatives", () => admin.from("creatives").delete().eq("id", creative.id)],
      ["projects", () => admin.from("projects").delete().eq("id", project.id)],
      ["memberships", () => admin.from("memberships").delete().eq("agency_id", agency.id)],
      ["clients", () => admin.from("clients").delete().eq("id", client.id)],
      ["agencies", () => admin.from("agencies").delete().eq("id", agency.id)],
      [
        "users",
        () => admin.from("users").delete().in("id", [staffAuth.user.id, clientAuth.user.id]),
      ],
    ];
    for (const [label, run] of steps) {
      const { error } = await run();
      if (error) console.error(`Cleanup failed at ${label}:`, error);
    }
    await admin.auth.admin.deleteUser(staffAuth.user.id);
    await admin.auth.admin.deleteUser(clientAuth.user.id);
  },
});

export { expect };
