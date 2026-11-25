import { escapeHtml } from "./invite-email";

// The email that turns on an account made from a review link (direct
// instruction): its link opens a log-in with the email filled in, and
// logging in with the password is what activates it. Someone who didn't ask
// for it can ignore it; nothing is on until then.
export function activateEmail({
  agencyName,
  clientName,
  isNew,
  url,
}: {
  agencyName: string;
  clientName: string;
  // A password was just chosen on the link; otherwise they log in with their usual one.
  isNew: boolean;
  url: string;
}) {
  const subject = "Activate your Frank account";
  const how = isNew
    ? "Open the link and log in with the password you just chose to activate it."
    : "Open the link and log in with your usual Frank password to activate it.";
  const text = [
    `You asked for a Frank account to see all of ${clientName}'s posts from ${agencyName} in one place.`,
    "",
    how,
    "",
    `Activate your account: ${url}`,
    "",
    "This link expires in 3 months. If you didn't ask for this, you can ignore this email: nothing is switched on.",
  ].join("\n");
  const html = `<!doctype html>
<html><body style="margin:0;padding:32px 16px;background:#f6f6f4;font-family:Inter,-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1a1a1a">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:440px;background:#fff;border:1px solid #e6e6e2;border-radius:10px">
      <tr><td style="padding:32px">
        <div style="font-size:20px;font-weight:600;margin:0 0 12px">Activate your Frank account</div>
        <p style="font-size:15px;line-height:1.5;margin:0 0 12px;color:#555">You asked for a Frank account to see all of ${escapeHtml(clientName)}'s posts from ${escapeHtml(agencyName)} in one place.</p>
        <p style="font-size:15px;line-height:1.5;margin:0 0 24px;color:#555">${escapeHtml(how)}</p>
        <a href="${escapeHtml(url)}" style="display:inline-block;background:#1a1a1a;color:#fff;text-decoration:none;font-size:15px;font-weight:500;padding:11px 20px;border-radius:7px">Activate account</a>
        <p style="font-size:13px;line-height:1.5;margin:24px 0 0;color:#888">This link expires in 3 months. If you didn't ask for this, you can ignore this email: nothing is switched on.</p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
  return { subject, text, html };
}
