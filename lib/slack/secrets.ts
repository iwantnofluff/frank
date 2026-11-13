import { createHmac, timingSafeEqual } from "node:crypto";
import { decryptToken, encryptToken } from "@/lib/instagram/secrets";

// Server-only (phase154). A workspace's Slack bot key, encrypted at rest as
// Instagram's are (AES-256-GCM, lib/instagram/secrets.ts) but under its own
// key, SLACK_TOKEN_KEY (32 random bytes, base64); and the Add to Slack
// sign-in's state, signed with it.

const raw = () => {
  const k = process.env.SLACK_TOKEN_KEY;
  if (!k) throw new Error("Slack isn't configured — SLACK_TOKEN_KEY is missing.");
  return k;
};

export const encryptSlackToken = (token: string) => encryptToken(token, raw());
export const decryptSlackToken = (stored: string) => decryptToken(stored, raw());

// Which workspace, who started it, and where to come back to; signed, and
// good for 15 minutes.
export interface SlackState {
  agencyId: string;
  userId: string;
  returnOrigin: string;
  returnPath: string;
  // Sent to Slack when starting; finishing must send exactly the same one.
  redirectUri: string;
  expiresAt: number;
}

const sign = (payload: string) =>
  createHmac("sha256", Buffer.concat([Buffer.from("slack-state:"), Buffer.from(raw(), "base64")]))
    .update(payload)
    .digest("base64url");

export function signSlackState(state: SlackState): string {
  const payload = Buffer.from(JSON.stringify(state)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifySlackState(value: string | null, now = Date.now()): SlackState | null {
  if (!value) return null;
  const [payload, sig] = value.split(".");
  if (!payload || !sig) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const state = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as SlackState;
    return state.expiresAt > now ? state : null;
  } catch {
    return null;
  }
}
