"use client";

import { useEffect, useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { cropToFile, detectFace, loadImage } from "@/lib/face-crop";
import { clampCrop, initialCrop, resizeCrop, type Crop } from "@/lib/face-crop-math";

const VIEW = 280;

type Status = "detecting" | "found" | "none" | "manual";

// Opens on a square already centred on the detected face (or the middle of
// the photo, if there isn't one); drag to move it, slide to zoom. Only the
// square inside the circle is kept.
export function PhotoCropModal({
  file,
  onCancel,
  onConfirm,
  detectFaces = true,
  title = "Position your photo",
}: {
  file: File;
  onCancel: () => void;
  onConfirm: (cropped: File) => void;
  // Off for client images (logos, brand marks): no face to look for, so it
  // starts from the largest centred square.
  detectFaces?: boolean;
  title?: string;
}) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [crop, setCrop] = useState<Crop | null>(null);
  const [status, setStatus] = useState<Status>(detectFaces ? "detecting" : "manual");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const drag = useRef<{ startX: number; startY: number; from: Crop } | null>(null);

  useEffect(() => {
    let cancelled = false;
    let loaded: HTMLImageElement | null = null;
    loadImage(file)
      .then(async (image) => {
        loaded = image;
        if (cancelled) return;
        setImg(image);
        const face = detectFaces ? await detectFace(image) : null;
        if (cancelled) return;
        setCrop(initialCrop(image.naturalWidth, image.naturalHeight, face));
        if (detectFaces) setStatus(face ? "found" : "none");
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
      if (loaded) URL.revokeObjectURL(loaded.src);
    };
  }, [file, detectFaces]);

  const scale = crop ? VIEW / crop.size : 1;
  const maxSize = img ? Math.min(img.naturalWidth, img.naturalHeight) : 1;
  // Zooming in further than ~6% of the shorter side just shows pixels.
  const minSize = Math.min(Math.max(maxSize * 0.06, 32), maxSize);

  function onPointerDown(e: React.PointerEvent) {
    if (!crop) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { startX: e.clientX, startY: e.clientY, from: crop };
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current || !img) return;
    const { startX, startY, from } = drag.current;
    // Dragging moves the photo under the circle, so the crop moves the
    // opposite way, in photo pixels.
    setCrop(
      clampCrop(
        {
          ...from,
          x: from.x - (e.clientX - startX) / scale,
          y: from.y - (e.clientY - startY) / scale,
        },
        img.naturalWidth,
        img.naturalHeight,
      ),
    );
  }
  function onPointerUp() {
    drag.current = null;
  }

  async function confirm() {
    if (!img || !crop) return;
    setSaving(true);
    try {
      onConfirm(await cropToFile(img, crop, !detectFaces && file.type === "image/png" ? "image/png" : "image/jpeg"));
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  }

  return (
    <Modal
      title={title}
      size="sm"
      onClose={onCancel}
      footer={
        <>
          <div className="grow" />
          <button type="button" className="btn" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={!crop || saving}
            onClick={() => confirm()}
          >
            {saving ? "Preparing…" : detectFaces ? "Use photo" : "Use image"}
          </button>
        </>
      }
    >
      <div
        className="pcrop"
        style={{ width: VIEW, height: VIEW }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        aria-label="Drag to reposition your photo"
        role="img"
      >
        {img && crop && (
          // eslint-disable-next-line @next/next/no-img-element -- a local object URL being cropped
          <img
            src={img.src}
            alt=""
            draggable={false}
            style={{
              width: img.naturalWidth * scale,
              height: img.naturalHeight * scale,
              transform: `translate(${-crop.x * scale}px, ${-crop.y * scale}px)`,
            }}
          />
        )}
        <div className={detectFaces ? "pcrop-ring" : "pcrop-ring tile"} />
      </div>

      {crop && img && (
        <label className="pcrop-zoom">
          <span>Zoom</span>
          <input
            type="range"
            aria-label="Zoom"
            min={0}
            max={100}
            value={Math.round(((maxSize - crop.size) / (maxSize - minSize || 1)) * 100)}
            onChange={(e) => {
              const t = Number(e.target.value) / 100;
              setCrop(resizeCrop(crop, maxSize - t * (maxSize - minSize), img.naturalWidth, img.naturalHeight));
            }}
          />
        </label>
      )}

      <p className="sub" role="status" style={{ margin: "10px 0 0", textAlign: "center" }}>
        {error
          ? error
          : status === "manual"
            ? "Drag and zoom to frame the square that's kept."
            : status === "detecting"
            ? "Finding your face…"
            : status === "found"
              ? "Centred on your face — drag or zoom to adjust."
              : "Couldn't spot a face — drag and zoom to frame your head."}
      </p>
    </Modal>
  );
}
