import { createHmac, timingSafeEqual } from "node:crypto";

// The link that confirms a platform admin's new sign-in email (Admin →
// Settings → Password & Security). Supabase's own email change wants both
// the old and the new address to confirm, through its rate-limited mailer
// ("secure email change" is on); Frank sends one link to the new address
// instead, signed here and good for an hour. Server-only: the key is the
// service-role key, which never leaves the server.
const key = () => {
  const k = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!k) throw new Error("SUPABASE_SERVICE_ROLE_KEY is missing");
  return `frank-admin-email-change:${k}`;
};
const sign = (payload: string) => createHmac("sha256", key()).update(payload).digest("base64url");

export function makeEmailChangeToken(userId: string, email: string, now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ u: userId, e: email, x: now + 60 * 60 * 1000 })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function readEmailChangeToken(token: string, now = Date.now()): { userId: string; email: string } | null {
  const [payload, mac] = token.split(".");
  if (!payload || !mac) return null;
  const a = Buffer.from(sign(payload));
  const b = Buffer.from(mac);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const { u, e, x } = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (typeof u !== "string" || typeof e !== "string" || typeof x !== "number" || x < now) return null;
    return { userId: u, email: e };
  } catch {
    return null;
  }
}
