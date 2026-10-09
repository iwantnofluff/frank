// Frank's version numbers (lib/releases.ts): 1.minor.patch.

// Newer first: negative when a is newer than b.
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (pb[i] ?? 0) - (pa[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

// As people read it: "1.12", "1.05" (the middle number in two digits, so
// the list reads in order as decimals too: reported directly, 1.5 looked
// newer than 1.12), or "1.08.1" for a fix to 1.08.
export function displayVersion(v: string): string {
  const [major, minor, patch] = v.split(".");
  const shown = `${major}.${(minor ?? "0").padStart(2, "0")}`;
  return patch && patch !== "0" ? `${shown}.${patch}` : shown;
}
