import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// Server-only (phase54). Instagram access tokens are encrypted at rest
// (AES-256-GCM), and the sign-in's state is signed, both with
// INSTAGRAM_TOKEN_KEY (32 random bytes, base64).

function key(raw = process.env.INSTAGRAM_TOKEN_KEY): Buffer {
  if (!raw) throw new Error("Instagram isn't configured — INSTAGRAM_TOKEN_KEY is missing.");
  const k = Buffer.from(raw, "base64");
  if (k.length !== 32) throw new Error("INSTAGRAM_TOKEN_KEY must be 32 bytes, base64.");
  return k;
}

// iv (12) + tag (16) + ciphertext, base64.
export function encryptToken(token: string, raw?: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(raw), iv);
  const body = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64");
}

export function decryptToken(stored: string, raw?: string): string {
  const all = Buffer.from(stored, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key(raw), all.subarray(0, 12));
  decipher.setAuthTag(all.subarray(12, 28));
  return Buffer.concat([decipher.update(all.subarray(28)), decipher.final()]).toString("utf8");
}

// What the sign-in carries through Instagram and back: which client, who
// started it (a signed-in Owner or Admin, or a client's connect link), and
// where to send them afterwards. Signed, and good for 15 minutes.
export interface ConnectState {
  clientId: string;
  // The signed-in person who started it, or the connect link used.
  userId?: string;
  linkId?: string;
  // The agency address to come back to, and the page there.
  returnOrigin: string;
  returnPath: string;
  expiresAt: number;
}

const b64url = (b: Buffer) => b.toString("base64url");
const sign = (payload: string, raw?: string) =>
  b64url(createHmac("sha256", Buffer.concat([Buffer.from("instagram-state:"), key(raw)])).update(payload).digest());

export function signState(state: ConnectState, raw?: string): string {
  const payload = b64url(Buffer.from(JSON.stringify(state)));
  return `${payload}.${sign(payload, raw)}`;
}

export function verifyState(value: string | null, raw?: string, now = Date.now()): ConnectState | null {
  if (!value) return null;
  const [payload, sig] = value.split(".");
  if (!payload || !sig) return null;
  const expected = Buffer.from(sign(payload, raw));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const state = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as ConnectState;
    return state.expiresAt > now ? state : null;
  } catch {
    return null;
  }
}

// Meta's signed request (deauthorize and data deletion callbacks):
// "signature.payload", both base64url, the signature HMAC-SHA256 of the
// payload with the app secret. Returns the payload only if it checks out.
export function parseSignedRequest(
  signed: string | null,
  appSecret = process.env.INSTAGRAM_APP_SECRET,
): { user_id?: string; algorithm?: string; issued_at?: number } | null {
  if (!signed || !appSecret) return null;
  const [sig, payload] = signed.split(".");
  if (!sig || !payload) return null;
  const expected = createHmac("sha256", appSecret).update(payload).digest();
  const given = Buffer.from(sig, "base64url");
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return data.algorithm && String(data.algorithm).toUpperCase() !== "HMAC-SHA256" ? null : data;
  } catch {
    return null;
  }
}
