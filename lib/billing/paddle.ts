import { createHmac, timingSafeEqual } from "node:crypto";
import { paddleEnv } from "./prices.ts";

// Server-only. Paddle's REST API through plain fetch, like Resend's — a
// handful of endpoints, so no SDK (phase39).

export class PaddleError extends Error {
  status: number;
  code: string | undefined;
  constructor(message: string, status: number, code: string | undefined) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function paddle<T>(method: "GET" | "POST" | "PATCH", path: string, body?: unknown): Promise<T> {
  const key = process.env.PADDLE_API_KEY;
  if (!key) throw new Error("Payments aren't configured yet — PADDLE_API_KEY is missing.");
  const base = paddleEnv() === "production" ? "https://api.paddle.com" : "https://sandbox-api.paddle.com";
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "Paddle-Version": "1" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => null)) as { data?: T; error?: { code?: string; detail?: string } } | null;
  if (!res.ok || !json?.data) {
    throw new PaddleError(json?.error?.detail ?? `Paddle answered ${res.status}`, res.status, json?.error?.code);
  }
  return json.data;
}

// Paddle signs each notification: Paddle-Signature is "ts=…;h1=…", h1 being
// HMAC-SHA256 of "ts:body" with the destination's secret. Older than five
// minutes is refused, so a captured one can't be replayed later.
export function verifyPaddleSignature(
  rawBody: string,
  header: string | null,
  secret: string,
  now: number = Date.now(),
): boolean {
  if (!header) return false;
  const parts = Object.fromEntries(
    header.split(";").map((p) => {
      const i = p.indexOf("=");
      return [p.slice(0, i).trim(), p.slice(i + 1).trim()];
    }),
  ) as Record<string, string>;
  const ts = Number(parts.ts);
  if (!parts.ts || !Number.isFinite(ts) || !parts.h1) return false;
  if (Math.abs(now / 1000 - ts) > 300) return false;
  const expected = createHmac("sha256", secret).update(`${parts.ts}:${rawBody}`).digest("hex");
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(parts.h1, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
