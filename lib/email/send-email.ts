// Server-only. Resend's REST API through plain fetch — one endpoint, so no SDK.
export async function sendEmail({
  to,
  subject,
  html,
  text,
}: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<{ skipped: boolean }> {
  // RFC 2606 reserves .invalid as never deliverable; the e2e suite invites
  // addresses there, and handing them to Resend would only generate bounces
  // against the sending domain's reputation.
  if (to.toLowerCase().endsWith(".invalid")) return { skipped: true };

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    throw new Error("Email isn't configured yet — RESEND_API_KEY and EMAIL_FROM are missing.");
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject, html, text }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new Error(`The email provider rejected the message: ${body?.message ?? res.status}`);
  }
  return { skipped: false };
}
