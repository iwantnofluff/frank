import { escapeHtml } from "./invite-email";

// The team told by email that a client commented on or approved a post
// (phase80), in the invite email's own look.
export function clientActivityEmail({
  kind,
  who,
  postName,
  clientName,
  comment,
  url,
}: {
  kind: "client_comment" | "client_approval";
  who: string;
  postName: string;
  clientName: string;
  comment: string | null;
  url: string;
}) {
  const did = kind === "client_approval" ? "approved" : "commented on";
  const subject = `${who} ${did} ${postName} · ${clientName}`;
  const text = [
    `${who} (${clientName}) ${did} ${postName}.`,
    ...(comment ? ["", `“${comment}”`] : []),
    "",
    `Open it: ${url}`,
    "",
    `You get these because ${clientName}'s Preferences in Frank say so.`,
  ].join("\n");
  const html = `<!doctype html>
<html><body style="margin:0;padding:32px 16px;background:#f6f6f4;font-family:Inter,-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1a1a1a">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:440px;background:#fff;border:1px solid #e6e6e2;border-radius:10px">
      <tr><td style="padding:32px">
        <div style="font-size:20px;font-weight:600;margin:0 0 12px">${escapeHtml(who)} ${did} ${escapeHtml(postName)}</div>
        <p style="font-size:15px;line-height:1.5;margin:0 0 ${comment ? "16" : "24"}px;color:#555">${escapeHtml(clientName)}</p>
        ${comment ? `<p style="font-size:15px;line-height:1.5;margin:0 0 24px;padding:12px 14px;background:#f6f6f4;border-radius:8px;white-space:pre-line">${escapeHtml(comment)}</p>` : ""}
        <a href="${escapeHtml(url)}" style="display:inline-block;background:#1a1a1a;color:#fff;text-decoration:none;font-size:15px;font-weight:500;padding:11px 20px;border-radius:7px">Open the post</a>
        <p style="font-size:13px;line-height:1.5;margin:24px 0 0;color:#888">You get these because ${escapeHtml(clientName)}'s Preferences in Frank say so.</p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
  return { subject, text, html };
}
