// Server-only. Reading from Resend (the admin area's email problems): plain
// fetch, like send-email.ts.
export async function resendGet<T>(path: string): Promise<T> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("Email isn't configured — RESEND_API_KEY is missing.");
  const res = await fetch(`https://api.resend.com${path}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new Error(`Resend answered ${res.status}${body?.message ? `: ${body.message}` : ""}`);
  }
  return (await res.json()) as T;
}

export interface Suppression {
  id: string;
  email: string;
  origin: "bounce" | "complaint" | "manual";
  created_at: string;
}

// Every address Resend won't send to, a page of 100 at a time (up to
// 1,000, plenty for now).
export async function listSuppressions(): Promise<Suppression[]> {
  const out: Suppression[] = [];
  let after: string | null = null;
  for (let page = 0; page < 10; page++) {
    const query: string = `/suppressions?limit=100${after ? `&after=${after}` : ""}`;
    const list: { data: Suppression[]; has_more: boolean } = await resendGet(query);
    out.push(...list.data);
    if (!list.has_more || !list.data.length) break;
    after = list.data[list.data.length - 1].id;
  }
  return out;
}

export interface SentEmail {
  id: string;
  to: string[];
  subject: string;
  created_at: string;
  last_event: string;
}

// The most recent emails Frank sent (100), with how each one ended.
export async function recentEmails(): Promise<SentEmail[]> {
  return (await resendGet<{ data: SentEmail[] }>("/emails?limit=100")).data;
}
