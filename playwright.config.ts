import { defineConfig } from "@playwright/test";

// Visual-regression suite for the prototype-parity work. Requires the dev
// server already running on :3000 and SUPABASE_SERVICE_ROLE_KEY set in
// .env.local — see tests/e2e/fixtures.ts for what the fixture needs and
// docs/parity-gaps.md / docs/comment-visibility-verification.md for the
// seeding rules it follows.
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  retries: 0,
  // Each spec's `frank` fixture does real Supabase setup (2 auth users, 6+
  // rows) before the test body even starts. At the default worker count
  // (CPU-based, often 8+ on a dev machine) that many fixtures hitting the
  // dev server and Supabase at once caused a bare page.goto to exceed its
  // 30s timeout — not a flaky assertion, navigation itself never
  // completed. Capped rather than raising the timeout, since the timeout
  // wasn't wrong, the concurrency was.
  workers: 4,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    viewport: { width: 1280, height: 900 },
  },
  // No maxDiffPixelRatio override. An earlier value of 0.02 here (2% of a
  // 1280x900 frame, ~23k pixels) turned out to be loose enough that a
  // premature screenshot — an entire missing table, a whole blank content
  // area — still registered as "matching" its (also-wrong) baseline. Found
  // by re-reviewing the baselines against the prototype and noticing they
  // didn't reflect what the app actually renders; see the corrected
  // baselines' git history. Playwright's per-pixel default is what's
  // actually catching content-level differences now.
});
