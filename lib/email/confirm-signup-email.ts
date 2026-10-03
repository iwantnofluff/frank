import { escapeHtml } from "./invite-email";

// Confirming the email a new agency signed up with (phase42), in the same
// shape as the invite and reset emails. The link opens the agency's own
// address, signed in.
export function confirmSignupEmail({ url, agencyName, address }: { url: string; agencyName: string; address: string }) {
  const subject = `Confirm your email to open ${agencyName} on Frank`;
  const text = [
    `Welcome to Frank. ${agencyName}'s workspace is ready at ${address}.`,
    "",
    `Confirm your email to open it: ${url}`,
    "",
    "Your 30-day free trial starts now. If you didn't sign up, ignore this email and nothing happens.",
  ].join("\n");
  const html = `<!doctype html>
<html><body style="margin:0;padding:32px 16px;background:#f6f6f4;font-family:Inter,-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1a1a1a">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:440px;background:#fff;border:1px solid #e6e6e2;border-radius:10px">
      <tr><td style="padding:32px">
        <div style="font-size:20px;font-weight:600;margin:0 0 12px">Confirm your email</div>
        <p style="font-size:15px;line-height:1.5;margin:0 0 24px;color:#555">Welcome to Frank. ${escapeHtml(agencyName)}&rsquo;s workspace is ready at <b>${escapeHtml(address)}</b>.</p>
        <a href="${escapeHtml(url)}" style="display:inline-block;background:#1a1a1a;color:#fff;text-decoration:none;font-size:15px;font-weight:500;padding:11px 20px;border-radius:7px">Confirm and open it</a>
        <p style="font-size:13px;line-height:1.5;margin:24px 0 0;color:#888">Your 30-day free trial starts now. If you didn't sign up, ignore this email and nothing happens.</p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
  return { subject, text, html };
}

// "Which address was it?" — every agency the person belongs to.
export function yourAddressesEmail({ addresses }: { addresses: { name: string; url: string }[] }) {
  const subject = "Your Frank addresses";
  const text = [
    "You asked for the addresses of your Frank workspaces:",
    "",
    ...addresses.map((a) => `${a.name}: ${a.url}`),
    "",
    "If you didn't ask, ignore this email.",
  ].join("\n");
  const rows = addresses
    .map(
      (a) =>
        `<p style="font-size:15px;line-height:1.5;margin:0 0 10px"><b>${escapeHtml(a.name)}</b><br><a href="${escapeHtml(a.url)}" style="color:#1a1a1a">${escapeHtml(a.url.replace(/^https?:\/\//, ""))}</a></p>`,
    )
    .join("");
  const html = `<!doctype html>
<html><body style="margin:0;padding:32px 16px;background:#f6f6f4;font-family:Inter,-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1a1a1a">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:440px;background:#fff;border:1px solid #e6e6e2;border-radius:10px">
      <tr><td style="padding:32px">
        <div style="font-size:20px;font-weight:600;margin:0 0 16px">Your Frank addresses</div>
        ${rows}
        <p style="font-size:13px;line-height:1.5;margin:14px 0 0;color:#888">If you didn't ask, ignore this email.</p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
  return { subject, text, html };
}
