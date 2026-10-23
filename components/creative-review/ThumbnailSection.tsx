"use client";

import { useEffect, useRef, useState } from "react";
import { useArtworkUrl } from "@/hooks/use-asset-signed-url";
import { THUMBNAIL_TYPES, useSaveThumbnail, useThumbnailVersions, type ThumbnailVersion } from "@/hooks/use-thumbnails";
import { errorMessage } from "@/lib/errors";

// A video post's Thumbnail on the Content tab, after Creative (phase118,
// direct instruction): one image in Creative's slot, saved as V1, V2 and so
// on with earlier versions in tabs, read only. Its words, Thumbnail Text on
// Image, are on the Production tab. Saving one doesn't move the post's
// stage.
export function ThumbnailSection({
  creativeId,
  agencyId,
  aspectRatio,
}: {
  creativeId: string;
  agencyId: string;
  aspectRatio: string;
}) {
  const { data: versions } = useThumbnailVersions(creativeId);
  const latest = versions?.[0] ?? null;
  const [viewingNo, setViewingNo] = useState<number | null>(null);
  const viewed = viewingNo !== null && viewingNo !== latest?.versionNo ? versions?.find((v) => v.versionNo === viewingNo) : null;

  const [picked, setPicked] = useState<{ file: File; url: string } | null>(null);
  useEffect(
    () => () => {
      if (picked) URL.revokeObjectURL(picked.url);
    },
    [picked],
  );
  const [problem, setProblem] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const save = useSaveThumbnail(creativeId, agencyId);
  const nextNo = (latest?.versionNo ?? 0) + 1;

  function choose(file: File | undefined) {
    if (!file) return;
    if (!THUMBNAIL_TYPES.includes(file.type)) return setProblem("A thumbnail is a JPG, PNG or WebP image.");
    setProblem(null);
    setNote(null);
    setPicked({ file, url: URL.createObjectURL(file) });
  }

  async function handleSave() {
    if (!picked) return;
    try {
      await save.mutateAsync({ file: picked.file, latestVersionNo: latest?.versionNo ?? 0 });
      setPicked(null);
      setViewingNo(null);
      setNote(`Saved as version ${nextNo}.`);
    } catch {
      // Shown below.
    }
  }

  return (
    <>
      <div className="msection-h">Thumbnail</div>
      <p className="msection-d">The cover the platform shows before the video plays, saved as versions.</p>

      {versions && versions.length > 1 && (
        <div className="viewbar" style={{ marginBottom: 10 }} role="tablist" aria-label="Thumbnail versions">
          {versions.map((v) => (
            <span className="vtabwrap" key={v.versionNo}>
              <button
                type="button"
                role="tab"
                className="vtab"
                aria-label={`Thumbnail V${v.versionNo}`}
                aria-selected={(viewingNo ?? latest?.versionNo) === v.versionNo}
                onClick={() => setViewingNo(v.versionNo === latest?.versionNo ? null : v.versionNo)}
              >
                V{v.versionNo}
              </button>
            </span>
          ))}
        </div>
      )}

      {viewed ? (
        <>
          <p className="sub" style={{ marginBottom: 10 }}>
            An earlier version, read only. A new thumbnail is saved as V{nextNo}.
          </p>
          <div className="cslots">
            <div className="cslot-cell">
              <div className="cslot" style={{ aspectRatio }}>
                <ThumbImage version={viewed} />
              </div>
            </div>
          </div>
        </>
      ) : (
        <>
          <input
            ref={input}
            type="file"
            accept=".jpg,.jpeg,.png,.webp"
            aria-label="Thumbnail file"
            style={{ display: "none" }}
            onChange={(e) => {
              choose(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <p className="sub" style={{ marginBottom: 8 }}>
            Drop an image on the slot, or click it to browse. JPG, PNG or WebP up to 20MB.
          </p>
          <div
            className="cslots"
            aria-label="Thumbnail"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              choose(e.dataTransfer.files?.[0]);
            }}
          >
            <div className="cslot-cell">
              <div className={`cslot${picked || latest?.asset ? " filled" : ""}`} style={{ aspectRatio }}>
                {picked ? (
                  // eslint-disable-next-line @next/next/no-img-element -- a local preview
                  <img src={picked.url} alt={picked.file.name} />
                ) : latest?.asset ? (
                  <ThumbImage version={latest} />
                ) : (
                  <button type="button" className="cslot-add" aria-label="Add the thumbnail" onClick={() => input.current?.click()}>
                    +
                  </button>
                )}
                {(picked || latest?.asset) && (
                  <div className="cslot-acts">
                    <button type="button" aria-label="Replace the thumbnail" onClick={() => input.current?.click()}>
                      Replace
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="field btnrow" style={{ marginTop: 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button type="button" className="btn sm primary" disabled={!picked || save.isPending} onClick={handleSave}>
                {save.isPending ? "Saving…" : `Save Thumbnail V${nextNo}`}
              </button>
              {picked && (
                <button type="button" className="btn sm" disabled={save.isPending} onClick={() => setPicked(null)}>
                  Discard Changes
                </button>
              )}
              {!picked && note && <span className="bsaved">{note}</span>}
            </div>
            {picked && !save.isPending && (
              <p className="note warn cslots-unsaved" role="status">
                Not added yet. Press Save Thumbnail V{nextNo} to add it as version {nextNo}.
              </p>
            )}
            {problem && <p className="autherr">{problem}</p>}
            {save.error && <p className="autherr">{errorMessage(save.error, "Couldn't save the thumbnail")}</p>}
          </div>
        </>
      )}

    </>
  );
}

function ThumbImage({ version }: { version: ThumbnailVersion }) {
  const { data: url } = useArtworkUrl(version.asset?.storage_key);
  if (!version.asset) return <span className="cslot-empty">Removed with the artwork</span>;
  if (!url) return <span className="cslot-empty">{version.asset.filename}</span>;
  // eslint-disable-next-line @next/next/no-img-element -- a short-lived signed URL
  return <img src={url} alt={version.asset.filename} />;
}
