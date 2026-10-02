import { escapeHtml } from "./invite-email";

// The "set a new password" email, in the same shape as the invite email.
export function resetPasswordEmail({ url, workspaceName }: { url: string; workspaceName: string | null }) {
  const where = workspaceName ? `${workspaceName} on Frank` : "Frank";
  const subject = `Reset your password for ${where}`;
  const text = [
    `Someone asked to reset the password for your account on ${where}.`,
    "",
    `Set a new password: ${url}`,
    "",
    "This link expires in an hour. If it wasn't you, ignore this email — your password stays as it is.",
  ].join("\n");
  const html = `<!doctype html>
<html><body style="margin:0;padding:32px 16px;background:#f6f6f4;font-family:Inter,-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1a1a1a">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:440px;background:#fff;border:1px solid #e6e6e2;border-radius:10px">
      <tr><td style="padding:32px">
        <div style="font-size:20px;font-weight:600;margin:0 0 12px">Reset your password</div>
        <p style="font-size:15px;line-height:1.5;margin:0 0 24px;color:#555">Someone asked to reset the password for your account on ${escapeHtml(where)}.</p>
        <a href="${escapeHtml(url)}" style="display:inline-block;background:#1a1a1a;color:#fff;text-decoration:none;font-size:15px;font-weight:500;padding:11px 20px;border-radius:7px">Set a new password</a>
        <p style="font-size:13px;line-height:1.5;margin:24px 0 0;color:#888">This link expires in an hour. If it wasn't you, ignore this email — your password stays as it is.</p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
  return { subject, text, html };
}
