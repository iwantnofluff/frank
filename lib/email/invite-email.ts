export function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function inviteEmail({
  agencyName,
  inviterName,
  roleLabel,
  url,
}: {
  agencyName: string;
  inviterName: string;
  roleLabel: string;
  url: string;
}) {
  const subject = `${inviterName} invited you to ${agencyName} on Frank`;
  const text = [
    `${inviterName} invited you to join ${agencyName} on Frank as ${roleLabel}.`,
    "",
    `Accept the invite: ${url}`,
    "",
    "This link expires in 48 hours. If you weren't expecting it, you can ignore this email.",
  ].join("\n");
  const a = escapeHtml(agencyName);
  const html = `<!doctype html>
<html><body style="margin:0;padding:32px 16px;background:#f6f6f4;font-family:Inter,-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1a1a1a">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:440px;background:#fff;border:1px solid #e6e6e2;border-radius:10px">
      <tr><td style="padding:32px">
        <div style="font-size:20px;font-weight:600;margin:0 0 12px">Join ${a} on Frank</div>
        <p style="font-size:15px;line-height:1.5;margin:0 0 24px;color:#555">${escapeHtml(inviterName)} invited you to join ${a} as ${escapeHtml(roleLabel)}.</p>
        <a href="${escapeHtml(url)}" style="display:inline-block;background:#1a1a1a;color:#fff;text-decoration:none;font-size:15px;font-weight:500;padding:11px 20px;border-radius:7px">Accept invite</a>
        <p style="font-size:13px;line-height:1.5;margin:24px 0 0;color:#888">This link expires in 48 hours. If you weren't expecting it, you can ignore this email.</p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
  return { subject, text, html };
}
