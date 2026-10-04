"use client";

import { useState } from "react";

// After inviting (decided directly): each person's link, to share directly as
// well as by the email Frank sends.
export function InviteLinks({ sent }: { sent: { email: string; name: string; url: string; emailError?: string }[] }) {
  const [copied, setCopied] = useState<string | null>(null);
  return (
    <div className="invitelinks">
      <p className="sub">
        {sent.length === 1 ? "Invite sent." : `${sent.length} invites sent.`} You can also share the invite{" "}
        {sent.length === 1 ? "link" : "links"} below directly. Each works once, for 48 hours, for that person&rsquo;s email.
      </p>
      {sent.map((s) => (
        <div className="invitelink" key={s.url}>
          <span className="sl">
            <b>{s.name}</b>
            <span>{s.emailError ? `The email didn't send, so share this link: ${s.email}` : s.email}</span>
          </span>
          <input className="bin one" readOnly value={s.url} aria-label={`Invite link for ${s.email}`} onFocus={(e) => e.target.select()} />
          <button
            type="button"
            className="btn sm"
            onClick={async () => {
              await navigator.clipboard.writeText(s.url).catch(() => {});
              setCopied(s.url);
              setTimeout(() => setCopied((c) => (c === s.url ? null : c)), 2000);
            }}
          >
            {copied === s.url ? "Copied" : "Copy"}
          </button>
        </div>
      ))}
    </div>
  );
}
