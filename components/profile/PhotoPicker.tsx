"use client";

import { useRef, useState } from "react";
import { PersonAvatar } from "@/components/ui/PersonAvatar";
import { PhotoCropModal } from "@/components/profile/PhotoCropModal";
import { AVATAR_TYPES, validateAvatarSource } from "@/lib/upload-avatar";

// Shows whatever photo is current (a picked-but-not-yet-uploaded crop's own
// preview, or the saved one's signed URL) with Upload/Change and Remove. A
// picked file goes through the cropper first; onPick only ever receives the
// cropped square.
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
  const [cropping, setCropping] = useState<File | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
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
            JPG, PNG or WebP — we&rsquo;ll centre it on your face
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
            e.target.value = "";
            if (!file) return;
            const bad = validateAvatarSource(file);
            setProblem(bad);
            if (!bad) setCropping(file);
          }}
        />
      </div>
      {problem && <p className="autherr">{problem}</p>}
      {cropping && (
        <PhotoCropModal
          file={cropping}
          onCancel={() => setCropping(null)}
          onConfirm={(cropped) => {
            setCropping(null);
            onPick(cropped);
          }}
        />
      )}
    </div>
  );
}
