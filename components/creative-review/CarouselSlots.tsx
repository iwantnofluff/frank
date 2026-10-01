"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAssetSignedUrl } from "@/hooks/use-asset-signed-url";
import { versionSlides, type CreativeVersionRow, type VersionAsset } from "@/hooks/use-creative-versions";
import type { SlideSource } from "@/hooks/use-upload-creative-version";
import { validateUploadFile, ACCEPTED_FILE_EXTENSIONS } from "@/lib/upload-validation";

// A carousel's artwork in the Edit window: one slot per slide. Decided
// directly: a version is the whole set, so the slots start as the latest
// version's slides and Save Version saves all of them as the next version
// — a replaced slide is uploaded, the rest are carried over as they are.
// Files dropped together fill the empty slots in order; a slot dragged
// onto another swaps the two.

type Slot = { kind: "asset"; asset: VersionAsset } | { kind: "file"; file: File; url: string } | null;

function slotsFrom(version: CreativeVersionRow | null, count: number): Slot[] {
  const byPosition = new Map(versionSlides(version).map((s) => [s.position, s.asset]));
  return Array.from({ length: count }, (_, i) => {
    const asset = byPosition.get(i + 1);
    return asset ? { kind: "asset", asset } : null;
  });
}

function sameSlot(a: Slot, b: Slot) {
  if (!a || !b) return a === b;
  return a.kind === "asset" && b.kind === "asset" && a.asset.id === b.asset.id;
}

export function CarouselSlots({
  slideCount,
  latest,
  readOnlyVersion,
  aspectRatio,
  nextVersionNo,
  saving,
  saveNote,
  onSave,
  onPendingChange,
  onError,
}: {
  slideCount: number;
  // The version new work builds on (null before any artwork).
  latest: CreativeVersionRow | null;
  // An older version being looked at: shown, not editable.
  readOnlyVersion?: CreativeVersionRow | null;
  aspectRatio: string;
  nextVersionNo: number;
  saving: boolean;
  saveNote: string | null;
  onSave: (slides: SlideSource[]) => void;
  onPendingChange: (pending: boolean) => void;
  onError: (message: string | null) => void;
}) {
  const baseline = useMemo(() => slotsFrom(latest, slideCount), [latest, slideCount]);
  const [slots, setSlots] = useState<Slot[]>(baseline);
  const inputRef = useRef<HTMLInputElement>(null);
  const fillFrom = useRef(0);
  const dragFrom = useRef<number | null>(null);

  // A new latest version (just saved, or one deleted) starts the slots over.
  const latestId = latest?.id ?? null;
  const [slotsFor, setSlotsFor] = useState(latestId);
  if (slotsFor !== latestId) {
    setSlotsFor(latestId);
    setSlots(baseline);
  }
  // The slide count can change while the window is open (Brief tab).
  const shown = Array.from({ length: slideCount }, (_, i) => slots[i] ?? null);

  const pending = shown.some((s, i) => !sameSlot(s, baseline[i] ?? null));
  useEffect(() => onPendingChange(pending), [pending, onPendingChange]);

  // Object URLs for picked files are released when they're replaced or the
  // slots unmount.
  const urls = useRef(new Set<string>());
  useEffect(() => {
    const live = urls.current;
    return () => live.forEach((u) => URL.revokeObjectURL(u));
  }, []);

  function place(files: File[], start: number) {
    for (const file of files) {
      const v = validateUploadFile(file);
      if (!v.ok) {
        onError(v.message);
        return;
      }
    }
    const next = [...shown];
    // The first file goes where it was dropped or picked; the rest fill the
    // empty slots after it, then any empty ones before it. A file with
    // nowhere to go is never dropped silently.
    const targets = [
      start,
      ...next.map((_, i) => i).filter((i) => i > start && !next[i]),
      ...next.map((_, i) => i).filter((i) => i < start && !next[i]),
    ];
    const placed = Math.min(files.length, targets.length);
    files.slice(0, placed).forEach((file, k) => {
      const url = URL.createObjectURL(file);
      urls.current.add(url);
      next[targets[k]] = { kind: "file", file, url };
    });
    const left = files.length - placed;
    onError(
      left > 0
        ? `This carousel has ${slideCount} slides, so ${left} file${left === 1 ? " wasn't" : "s weren't"} added. Raise the slide count on the Brief tab to add more.`
        : null,
    );
    setSlots(next);
  }

  function swap(a: number, b: number) {
    if (a === b) return;
    const next = [...shown];
    [next[a], next[b]] = [next[b], next[a]];
    setSlots(next);
  }

  if (readOnlyVersion) {
    const view = slotsFrom(readOnlyVersion, Math.max(slideCount, versionSlides(readOnlyVersion).length));
    return (
      <div className="cslots" aria-label="Slides">
        {view.map((s, i) => (
          <div className="cslot" key={i} style={{ aspectRatio }}>
            <SlotImage slot={s} />
            <span className="cslot-n">{i + 1}</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPTED_FILE_EXTENSIONS}
        aria-label="Slide files"
        style={{ display: "none" }}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) place(files, fillFrom.current);
          e.target.value = "";
        }}
      />
      <p className="sub" style={{ marginBottom: 8 }}>
        Drop several images to fill the slides in order, or add them one at a time. Drag a slide onto another to swap
        them.
      </p>
      <div
        className="cslots"
        aria-label="Slides"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          const files = Array.from(e.dataTransfer.files ?? []);
          if (files.length && dragFrom.current === null) {
            e.preventDefault();
            place(files, shown.findIndex((s) => !s) === -1 ? 0 : shown.findIndex((s) => !s));
          }
        }}
      >
        {shown.map((s, i) => (
          <div
            key={i}
            className={`cslot${s ? " filled" : ""}`}
            style={{ aspectRatio }}
            draggable={!!s}
            onDragStart={() => (dragFrom.current = i)}
            onDragEnd={() => (dragFrom.current = null)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (dragFrom.current !== null) {
                swap(dragFrom.current, i);
                dragFrom.current = null;
              } else {
                const files = Array.from(e.dataTransfer.files ?? []);
                if (files.length) place(files, i);
              }
            }}
          >
            {s ? (
              <SlotImage slot={s} />
            ) : (
              <button
                type="button"
                className="cslot-add"
                aria-label={`Add slide ${i + 1}`}
                onClick={() => {
                  fillFrom.current = i;
                  inputRef.current?.click();
                }}
              >
                +
              </button>
            )}
            <span className="cslot-n">{i + 1}</span>
            {s && (
              <div className="cslot-acts">
                <button
                  type="button"
                  aria-label={`Replace slide ${i + 1}`}
                  onClick={() => {
                    fillFrom.current = i;
                    inputRef.current?.click();
                  }}
                >
                  Replace
                </button>
                <button
                  type="button"
                  aria-label={`Remove slide ${i + 1}`}
                  onClick={() => {
                    const next = [...shown];
                    next[i] = null;
                    setSlots(next);
                  }}
                >
                  Remove
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
        <button
          type="button"
          className="btn sm primary"
          disabled={!pending || saving}
          onClick={() => onSave(shown.map((s) => (!s ? null : s.kind === "file" ? { file: s.file } : { assetId: s.asset.id })))}
        >
          {saving ? "Saving…" : `Save Version ${nextVersionNo}`}
        </button>
        {pending && (
          <button type="button" className="btn sm" disabled={saving} onClick={() => setSlots(baseline)}>
            Discard Changes
          </button>
        )}
        {!pending && saveNote && <span className="bsaved">{saveNote}</span>}
      </div>
    </>
  );
}

function SlotImage({ slot }: { slot: Slot }) {
  const storageKey = slot?.kind === "asset" ? slot.asset.storage_key : undefined;
  const { data: signed } = useAssetSignedUrl(storageKey);
  if (!slot) return <span className="cslot-empty">Empty</span>;
  const mime = slot.kind === "asset" ? slot.asset.mime_type : slot.file.type;
  const src = slot.kind === "file" ? slot.url : signed;
  const name = slot.kind === "asset" ? slot.asset.filename : slot.file.name;
  if (!src) return <span className="cslot-empty">{name}</span>;
  if (mime.startsWith("video/")) return <video src={src} muted />;
  // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL or a local preview
  return <img src={src} alt={name} />;
}
