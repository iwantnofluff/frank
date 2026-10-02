"use client";

import type { UploadProgress } from "@/hooks/use-upload-creative-version";

const mb = (bytes: number) => `${(bytes / 1048576).toFixed(1)}MB`;

// The uploader: what a save is doing right now — compressing a video, or
// uploading — with a bar, a percentage and, while uploading, the size.
export function UploadProgressBar({ progress }: { progress: UploadProgress }) {
  const pct = Math.round(Math.min(Math.max(progress.fraction, 0), 1) * 100);
  const what = progress.stage === "compressing" ? "Compressing video" : "Uploading";
  const which = progress.files > 1 ? ` · file ${progress.file} of ${progress.files}` : "";
  const size =
    progress.stage === "uploading" && progress.total ? ` · ${mb(progress.loaded ?? 0)} of ${mb(progress.total)}` : "";
  return (
    <div className="upbar">
      <div className="upbar-h">
        <span>
          {what}
          {which}
        </span>
        <span className="upbar-n">
          {pct}%{size}
        </span>
      </div>
      <div
        className={`upbar-track ${progress.stage}`}
        role="progressbar"
        aria-label={`${what}${which}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
      >
        <div className="upbar-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
