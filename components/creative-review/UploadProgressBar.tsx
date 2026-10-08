"use client";

import type { UploadProgress } from "@/hooks/use-upload-creative-version";

const mb = (bytes: number) => `${(bytes / 1048576).toFixed(1)}MB`;

// The uploader: what a save is doing right now (compressing a video,
// uploading, then saving the version) with a bar, a percentage and, while
// uploading, the size. It never sits at 100% without saying what's left
// (reported directly: the bar wasn't in step with the upload).
export function UploadProgressBar({ progress, versionNo }: { progress: UploadProgress; versionNo: number }) {
  let pct = Math.round(Math.min(Math.max(progress.fraction, 0), 1) * 100);
  // 100% only once storage has the whole file, not when rounding says so.
  if (progress.stage === "uploading" && (progress.loaded ?? 0) < (progress.total ?? 0)) pct = Math.min(pct, 99);
  // Some files (screen recordings, some editors' exports) report the whole
  // video read before the encoder is done with it.
  const what =
    progress.stage === "saving"
      ? `Saving version ${versionNo}…`
      : progress.stage === "compressing"
        ? pct >= 100
          ? "Finishing compression…"
          : "Compressing video"
        : progress.retrying
          ? "Connection lost, trying again…"
          : "Uploading";
  const which = progress.files > 1 && progress.stage !== "saving" ? ` · file ${progress.file} of ${progress.files}` : "";
  const size =
    progress.stage === "uploading" && progress.total ? ` · ${mb(progress.loaded ?? 0)} of ${mb(progress.total)}` : "";
  return (
    <div className="upbar">
      <div className="upbar-h">
        <span>
          {what}
          {which}
        </span>
        {progress.stage !== "saving" && (
          <span className="upbar-n">
            {pct}%{size}
          </span>
        )}
      </div>
      <div
        className={`upbar-track ${progress.stage}`}
        role="progressbar"
        aria-label={`${what}${which}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress.stage === "saving" ? undefined : pct}
      >
        <div className="upbar-fill" style={{ width: `${pct}%` }} />
      </div>
      <p className="upbar-note">Keep this window open until it says the version is saved.</p>
    </div>
  );
}
