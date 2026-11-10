"use client";

import { useEffect, useRef, useState } from "react";
import { versionSlides, type CreativeVersionRow } from "@/hooks/use-creative-versions";
import type { SlideSource } from "@/hooks/use-upload-creative-version";
import { validateUploadFile, ACCEPTED_FILE_EXTENSIONS } from "@/lib/upload-validation";
import { MAX_UPLOAD_MB } from "@/lib/upload-limits";
import { AssetThumb, CarouselSlots } from "./CarouselSlots";

// A post's artwork versions in the Edit window (direct instruction): all of
// them in a row, an empty Add New Version first, then the newest to the
// oldest, each with its number and date. For one image, the new version is
// dropped straight into that first card. For a carousel or stories, each
// card shows the first slide and how many there are; Add New Version opens
// the slots under the row, filled with the latest version's slides so only
// the one that changed needs uploading. A version clicked shows under the
// row, read only.

export type ShownVersion = number | "new" | null;

const DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });

export function VersionStrip({
  versions,
  slideCount,
  noun,
  aspectRatio,
  shown,
  onShow,
  onDelete,
  nextVersionNo,
  saving,
  savingLabel,
  saveNote,
  onSave,
  onPendingChange,
  onError,
}: {
  // Newest first.
  versions: CreativeVersionRow[];
  slideCount: number;
  noun: "Slide" | "Story";
  aspectRatio: string;
  // What's under the row: a version's number, the new version's slots, or
  // nothing.
  shown: ShownVersion;
  onShow: (v: ShownVersion) => void;
  onDelete: (v: CreativeVersionRow) => void;
  nextVersionNo: number;
  saving: boolean;
  savingLabel: string;
  saveNote: string | null;
  onSave: (slides: SlideSource[]) => void;
  onPendingChange: (pending: boolean) => void;
  onError: (message: string | null) => void;
}) {
  const single = slideCount === 1;
  const many = noun === "Story" ? "stories" : "slides";
  const latest = versions[0] ?? null;
  const viewed = typeof shown === "number" ? (versions.find((v) => v.version_no === shown) ?? null) : null;

  // One image: the file dropped into the Add New Version card.
  const [file, setFile] = useState<{ file: File; url: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pending = single && !!file;
  useEffect(() => {
    if (single) onPendingChange(pending);
  }, [single, pending, onPendingChange]);
  useEffect(() => () => {
    if (file) URL.revokeObjectURL(file.url);
  }, [file]);
  // A new latest version (just saved, or one deleted) empties the card.
  const latestId = latest?.id ?? null;
  const [cardFor, setCardFor] = useState(latestId);
  if (cardFor !== latestId) {
    setCardFor(latestId);
    setFile(null);
  }

  function pick(files: File[]) {
    const f = files[0];
    if (!f) return;
    const v = validateUploadFile(f);
    if (!v.ok) {
      onError(v.message);
      return;
    }
    onError(files.length > 1 ? `This post has one image, so ${files.length - 1} file${files.length === 2 ? " wasn't" : "s weren't"} added. Choose a carousel format on the Brief tab for more.` : null);
    setFile({ file: f, url: URL.createObjectURL(f) });
  }

  return (
    <>
      <p className="sub" style={{ marginBottom: 8 }}>
        {single
          ? `Drop an image or video on Add New Version, or click it to browse. JPG, PNG, WebP, GIF up to ${MAX_UPLOAD_MB}MB; MP4 and MOV are compressed to 720p.`
          : `Add New Version starts from the latest ${many}, so you only replace the ones that changed. Click a version to see all its ${many}.`}
      </p>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_FILE_EXTENSIONS}
        aria-label="New version file"
        style={{ display: "none" }}
        onChange={(e) => {
          pick(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />
      <div className="vstrip" role="list" aria-label="Creative versions">
        <div className="vcard" role="listitem">
          <div
            className={`vcard-img vcard-new${shown === "new" && !single ? " on" : ""}${file ? " filled" : ""}`}
            style={{ aspectRatio }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (single) pick(Array.from(e.dataTransfer.files ?? []));
              else onShow("new");
            }}
          >
            {file ? (
              file.file.type.startsWith("video/") ? (
                <video src={`${file.url}#t=0.1`} muted playsInline preload="metadata" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element -- a local preview
                <img src={file.url} alt={file.file.name} />
              )
            ) : (
              <button
                type="button"
                className="vcard-add"
                onClick={() => (single ? inputRef.current?.click() : onShow("new"))}
              >
                <span aria-hidden="true">+</span>
                Add New Version
              </button>
            )}
            {file && (
              <div className="cslot-acts">
                <button type="button" aria-label="Replace the new version's file" onClick={() => inputRef.current?.click()}>
                  Replace
                </button>
                <button type="button" aria-label="Remove the new version's file" onClick={() => setFile(null)}>
                  Remove
                </button>
              </div>
            )}
          </div>
          <span className="vcard-l">V{nextVersionNo} · New</span>
        </div>
        {versions.map((v, i) => {
          const slides = versionSlides(v);
          const on = shown === v.version_no;
          return (
            <div className="vcard" role="listitem" key={v.id}>
              <button
                type="button"
                className={`vcard-img${on ? " on" : ""}`}
                style={{ aspectRatio }}
                aria-pressed={on}
                aria-label={`Version ${v.version_no}${slides.length > 1 ? `, ${slides.length} ${many}` : ""}`}
                onClick={() => onShow(on ? (single ? null : "new") : v.version_no)}
              >
                <AssetThumb asset={slides[0]?.asset ?? null} />
                {slides.length > 1 && (
                  <span className="vcard-n">
                    {slides.length} {many}
                  </span>
                )}
              </button>
              <button
                type="button"
                className="vcard-x"
                title={`Delete Version ${v.version_no}`}
                aria-label={`Delete Version ${v.version_no}`}
                onClick={() => onDelete(v)}
              >
                <svg viewBox="0 0 24 24">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
              <span className="vcard-l">
                V{v.version_no} · {i === 0 ? "Latest" : DATE.format(new Date(v.created_at))}
              </span>
            </div>
          );
        })}
      </div>

      {single && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 14 }}>
            <button
              type="button"
              className="btn sm primary"
              disabled={!file || saving}
              onClick={() => file && onSave([{ file: file.file }])}
            >
              {saving ? savingLabel : `Save Creative V${nextVersionNo}`}
            </button>
            {file && (
              <button type="button" className="btn sm" disabled={saving} onClick={() => setFile(null)}>
                Discard Changes
              </button>
            )}
            {!file && saveNote && <span className="bsaved">{saveNote}</span>}
          </div>
          {/* It's only a version once saved (reported directly). */}
          {file && !saving && (
            <p className="note warn cslots-unsaved" role="status">
              Not added yet. Press Save Creative V{nextVersionNo} to add it as version {nextVersionNo}.
            </p>
          )}
        </>
      )}

      {/* Under the row: the version clicked, or a carousel's new slots. */}
      {viewed && (
        <div className="vstrip-below">
          <div className="vstrip-h">Version {viewed.version_no}</div>
          <CarouselSlots
            slideCount={slideCount}
            noun={noun}
            latest={latest}
            readOnlyVersion={viewed}
            aspectRatio={aspectRatio}
            nextVersionNo={nextVersionNo}
            saving={saving}
            saveNote={null}
            onSave={onSave}
            onPendingChange={() => {}}
            onError={onError}
          />
        </div>
      )}
      {/* Kept while another version is looked at, hidden, so slides picked
          but not saved aren't lost. */}
      {!single && (
        <div className="vstrip-below" hidden={shown !== "new"}>
          <div className="vstrip-h">New Version {nextVersionNo}</div>
          <CarouselSlots
            slideCount={slideCount}
            noun={noun}
            latest={latest}
            aspectRatio={aspectRatio}
            nextVersionNo={nextVersionNo}
            saving={saving}
            savingLabel={savingLabel}
            saveNote={saveNote}
            onSave={onSave}
            onPendingChange={onPendingChange}
            onError={onError}
          />
        </div>
      )}
    </>
  );
}
