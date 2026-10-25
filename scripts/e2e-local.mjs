#!/usr/bin/env node
// Runs the e2e suite against the local test database (decided directly,
// 25 Oct 2026), so tests leave staging alone: the local Supabase in Docker
// (built by scripts/e2e-db.mjs) and a test copy of the app on port 3100,
// beside the dev server on 3000, which keeps using staging.
//
//   npm run test:local                       the whole suite
//   npm run test:local -- tests/e2e/x.spec.ts  anything Playwright takes
//   npm run test:local -- --stop             stops the test app
//
// The test app is left running after a run, so the next starts at once.
// Only the database settings differ from .env.local; AI, email and the rest
// are as when testing against staging.

import { execFileSync, spawn } from "child_process";
import { closeSync, existsSync, openSync, readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const CLI = ["--yes", "supabase@2.120.0"];
const PORT = "3100";
const DIST = ".next-test";
const PID_FILE = path.join(ROOT, DIST, "test-app.pid");
const LOG_FILE = path.join(ROOT, DIST, "test-app.log");
const PATH = `/Applications/Docker.app/Contents/Resources/bin:${process.env.PATH}`;
const args = process.argv.slice(2);
const sh = (cmd, a, opts = {}) => execFileSync(cmd, a, { cwd: ROOT, env: { ...process.env, PATH }, ...opts });
const say = (s) => console.log(`· ${s}`);

function stopApp() {
  if (!existsSync(PID_FILE)) return say("The test app isn't running.");
  const pid = Number(readFileSync(PID_FILE, "utf8"));
  try {
    process.kill(-pid);
    say("Stopped the test app.");
  } catch {
    say("The test app had already stopped.");
  }
  writeFileSync(PID_FILE, "");
}
if (args[0] === "--stop") {
  stopApp();
  process.exit(0);
}

// Docker, and the local Supabase in it.
try {
  sh("docker", ["info"], { stdio: "ignore" });
} catch {
  console.error("Docker isn't running. Open Docker Desktop, wait for the whale to settle, and try again.");
  process.exit(1);
}
const status = () => {
  try {
    return JSON.parse(sh("npx", [...CLI, "status", "-o", "json"], { stdio: ["ignore", "pipe", "ignore"] }).toString());
  } catch {
    return null;
  }
};
let local = status();
if (!local?.API_URL) {
  say("Starting the local Supabase");
  sh("npx", [...CLI, "start"], { stdio: "inherit" });
  local = status();
}
const tables = sh("docker", ["exec", "supabase_db_frank", "psql", "-U", "postgres", "-d", "postgres", "-tAc", "select count(*) from pg_tables where schemaname = 'public'"])
  .toString()
  .trim();
if (tables === "0") {
  console.error("The local database is empty. Build it first: node scripts/e2e-db.mjs");
  process.exit(1);
}

const dbEnv = {
  NEXT_PUBLIC_SUPABASE_URL: local.API_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: local.ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: local.SERVICE_ROLE_KEY,
};

// The test app on its own port and build folder.
const up = async () => {
  try {
    return (await fetch(`http://localhost:${PORT}/login`, { signal: AbortSignal.timeout(60_000) })).ok;
  } catch {
    return false;
  }
};
if (!(await up())) {
  say(`Starting the test app on port ${PORT}`);
  sh("mkdir", ["-p", DIST]);
  const log = openSync(LOG_FILE, "w");
  const child = spawn("npx", ["next", "dev", "-p", PORT], {
    cwd: ROOT,
    env: { ...process.env, ...dbEnv, NEXT_DIST_DIR: DIST },
    detached: true,
    stdio: ["ignore", log, log],
  });
  child.unref();
  closeSync(log);
  writeFileSync(PID_FILE, String(child.pid));
  for (let i = 0; !(await up()); i++) {
    if (i > 60) {
      console.error(`The test app didn't start. Its log: ${LOG_FILE}`);
      process.exit(1);
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
}

say(`Running the tests against the local database (app on ${PORT})`);
const run = spawn("npx", ["playwright", "test", ...args], {
  cwd: ROOT,
  env: { ...process.env, ...dbEnv, E2E_PORT: PORT },
  stdio: "inherit",
});
run.on("exit", (code) => {
  say(`The test app is still running for the next run; npm run test:local -- --stop stops it.`);
  process.exit(code ?? 1);
});
