"use client";

import { useRef } from "react";
import { PersonAvatar } from "@/components/ui/PersonAvatar";
import { AVATAR_TYPES } from "@/lib/upload-avatar";

// Shows whatever photo is current (a picked-but-not-yet-uploaded file's own
// preview, or the saved one's signed URL) with Upload/Change and Remove.
export function PhotoPicker({
  initials,
  photoUrl,
  busy,
  onPick,
  onRemove,
}: {
  initials: string;
  photoUrl: string | null;
  busy?: boolean;
  onPick: (file: File) => void;
  onRemove?: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
      <PersonAvatar
        className="avatar"
        initials={initials || "?"}
        photoUrl={photoUrl}
        style={{ width: 64, height: 64, flexShrink: 0, margin: 0, fontSize: 20, background: "var(--line-2)", color: "var(--muted)" }}
      />
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button type="button" className="btn sm" disabled={busy} onClick={() => input.current?.click()}>
          {busy ? "Uploading…" : photoUrl ? "Change photo" : "Upload photo"}
        </button>
        {photoUrl && onRemove && (
          <button type="button" className="btn sm" disabled={busy} onClick={onRemove}>
            Remove
          </button>
        )}
        <span className="sub" style={{ margin: 0, fontSize: 12.5 }}>
          JPG, PNG or WebP, up to 5 MB
        </span>
      </div>
      <input
        ref={input}
        type="file"
        accept={AVATAR_TYPES.join(",")}
        aria-label="Profile photo"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onPick(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}
