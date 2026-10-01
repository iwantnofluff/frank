// Copies MediaPipe's WebAssembly runtime out of node_modules into public/,
// so the face detector is served from this app (same origin, the exact
// version package-lock pins) rather than a third-party CDN. Runs on every
// install, including Vercel's, so the ~23 MB of .wasm never goes in git.
import { copyFileSync, existsSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const from = join(root, "node_modules/@mediapipe/tasks-vision/wasm");
const to = join(root, "public/mediapipe/wasm");

if (!existsSync(from)) {
  console.warn("copy-mediapipe-wasm: @mediapipe/tasks-vision not installed, skipping");
  process.exit(0);
}
mkdirSync(to, { recursive: true });
for (const file of [
  "vision_wasm_internal.js",
  "vision_wasm_internal.wasm",
  "vision_wasm_nosimd_internal.js",
  "vision_wasm_nosimd_internal.wasm",
]) {
  copyFileSync(join(from, file), join(to, file));
}
console.log("copy-mediapipe-wasm: copied runtime to public/mediapipe/wasm");
