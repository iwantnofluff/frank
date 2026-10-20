"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  REFERENCE_IMAGES_MAX,
  referenceImageProblem,
  useAddReferenceImages,
  useReferenceImages,
  useRemoveReferenceImage,
} from "@/hooks/use-reference-images";
import { errorMessage } from "@/lib/errors";

// The image files among what was pasted or dropped.
export function imageFiles(list: DataTransferItemList | FileList | null | undefined): File[] {
  if (!list) return [];
  const files: File[] = [];
  for (const item of Array.from(list as ArrayLike<DataTransferItem | File>)) {
    const file = item instanceof File ? item : item.kind === "file" ? item.getAsFile() : null;
    if (file && file.type.startsWith("image/")) files.push(file);
  }
  return files;
}

// Pasted reference images on a post's Brief (phase111, direct
// instruction): a box to paste into (or drop on, or choose from), and the
// images under it. On a saved post each shows at once from this computer,
// with a bar while it goes up (direct instruction: show it straight away),
// and keeps that copy so it doesn't flicker when it's saved; on a new post
// they wait in `pending` and go up when it's made. The team only.
export function ReferenceImages({
  creativeId,
  agencyId,
  pending,
  onPendingChange,
  incoming,
}: {
  creativeId: string | null;
  agencyId: string | undefined;
  pending: File[];
  onPendingChange: (files: File[]) => void;
  // Files pasted elsewhere in References, handed in to add.
  incoming: { files: File[]; at: number } | null;
}) {
  const { data: saved } = useReferenceImages(creativeId);
  const add = useAddReferenceImages(creativeId);
  const remove = useRemoveReferenceImage(creativeId);
  const [problem, setProblem] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  // Going up now, shown from this computer; and the saved ones' copies
  // from this computer, by their id.
  const [uploading, setUploading] = useState<{ key: string; url: string }[]>([]);
  const [localUrls, setLocalUrls] = useState<Record<string, string>>({});
  const input = useRef<HTMLInputElement>(null);
  const pendingUrls = useMemo(() => pending.map((f) => URL.createObjectURL(f)), [pending]);
  useEffect(() => () => pendingUrls.forEach((u) => URL.revokeObjectURL(u)), [pendingUrls]);
  const count = (saved?.length ?? 0) + uploading.length + pending.length;

  function take(files: File[]) {
    setProblem(null);
    if (!files.length) return;
    const bad = files.map(referenceImageProblem).find(Boolean);
    if (bad) return setProblem(bad);
    if (count + files.length > REFERENCE_IMAGES_MAX) return setProblem(`A post can have up to ${REFERENCE_IMAGES_MAX} reference images.`);
    if (!creativeId) return onPendingChange([...pending, ...files]);
    if (!agencyId) return setProblem("Couldn't work out the workspace. Try again in a moment.");
    const shown = files.map((f) => ({ key: crypto.randomUUID(), url: URL.createObjectURL(f) }));
    setUploading((prev) => [...prev, ...shown]);
    add.mutate(
      { agencyId, files },
      {
        onSuccess: ({ ids }) => setLocalUrls((prev) => ({ ...prev, ...Object.fromEntries(ids.map((id, i) => [id, shown[i].url])) })),
        onError: () => shown.forEach((s) => URL.revokeObjectURL(s.url)),
        onSettled: () => setUploading((prev) => prev.filter((u) => !shown.some((s) => s.key === u.key))),
      },
    );
  }

  // What was pasted into a link box or the field.
  const lastIncoming = useRef<number | null>(null);
  useEffect(() => {
    if (!incoming || incoming.at === lastIncoming.current) return;
    lastIncoming.current = incoming.at;
    take(incoming.files);
    // take reads the latest props each time it's called.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incoming]);

  const savedCount = saved?.length ?? 0;
  return (
    <div
      className={`refimgs${over ? " over" : ""}`}
      onDragOver={(e) => {
        if (!Array.from(e.dataTransfer.types).includes("Files")) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        take(imageFiles(e.dataTransfer.files));
      }}
    >
      {/* A box to paste into (direct instruction: the paste needs a
          field). Click it, then paste; the field around it catches the
          paste and hands it in. Dropping works anywhere here. */}
      <div
        className="refimg-drop"
        tabIndex={0}
        role="button"
        aria-label="Paste or drop reference images here"
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            input.current?.click();
          }
        }}
      >
        <b>Paste an image here</b>
        <span>
          Click, then {typeof navigator !== "undefined" && /Mac/i.test(navigator.platform) ? "⌘V" : "Ctrl+V"}, or drop one in.{" "}
          <button
            type="button"
            className="linkbtn"
            onClick={(e) => {
              e.stopPropagation();
              input.current?.click();
            }}
          >
            Choose a file
          </button>
        </span>
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          multiple
          hidden
          onChange={(e) => {
            take(imageFiles(e.target.files));
            e.target.value = "";
          }}
        />
      </div>
      {count > 0 && (
        <div className="refimg-list">
          {(saved ?? []).map((img, i) => {
            const src = localUrls[img.id] ?? img.url;
            return (
              <div className="refimg" key={img.id}>
                {src ? (
                  // eslint-disable-next-line @next/next/no-img-element -- this computer's copy, or a short-lived signed storage URL
                  <img src={src} alt={`Reference image ${i + 1}`} />
                ) : (
                  <span className="refimg-none">Image</span>
                )}
                <button
                  type="button"
                  className="refx"
                  aria-label={`Remove reference image ${i + 1}`}
                  disabled={remove.isPending}
                  onClick={() => remove.mutate(img)}
                >
                  ×
                </button>
              </div>
            );
          })}
          {uploading.map((u) => (
            <div className="refimg adding" key={u.key} role="status" aria-label="Adding the image">
              {/* eslint-disable-next-line @next/next/no-img-element -- this computer's copy while it goes up */}
              <img src={u.url} alt="" />
              <span className="refimg-bar" />
            </div>
          ))}
          {pending.map((file, i) => (
            <div className="refimg" key={`p${i}`}>
              {/* eslint-disable-next-line @next/next/no-img-element -- a local preview */}
              <img src={pendingUrls[i]} alt={`Reference image ${savedCount + i + 1}`} />
              <button
                type="button"
                className="refx"
                aria-label={`Remove reference image ${savedCount + i + 1}`}
                onClick={() => onPendingChange(pending.filter((_, k) => k !== i))}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
      {(problem || add.error || remove.error) && (
        <p className="autherr">{problem ?? errorMessage(add.error ?? remove.error, "Couldn't add the image")}</p>
      )}
    </div>
  );
}
