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
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    viewport: { width: 1280, height: 900 },
  },
  expect: {
    toHaveScreenshot: { maxDiffPixelRatio: 0.02 },
  },
});
