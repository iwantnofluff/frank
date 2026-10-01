"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { formatVideoTime } from "@/lib/annotations";

export interface TimelineMarker {
  commentId: string;
  t: number;
  kind: "pin" | "region" | "time";
}

// A video with its own play/pause and timeline (phase34): every comment
// made at a moment is a marker on the timeline, and picking one jumps to
// that moment, pauses, and selects the comment — whose pin or box (drawn by
// the overlay) then shows on the frame. Pausing reports the moment, which
// is what a new comment is attached to. Not in the prototype, which has no
// video review — docs/parity-gaps.md.
export function VideoPlayer({
  src,
  markers,
  highlightedCommentId,
  onMarker,
  seek,
  pauseNow,
  onMoment,
  overlay,
}: {
  src: string;
  markers: TimelineMarker[];
  highlightedCommentId: string | null;
  onMarker: (commentId: string) => void;
  // Asked from outside (a comment picked in the list): go to this moment.
  seek: { t: number; nonce: number } | null;
  // A pin or box tool was picked: stop on the current frame.
  pauseNow?: boolean;
  // The paused moment, or null while playing.
  onMoment?: (t: number | null) => void;
  // Drawn over the frame, given the current moment and whether paused.
  overlay?: (t: number, paused: boolean) => ReactNode;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [paused, setPaused] = useState(true);

  function goTo(t: number) {
    const v = ref.current;
    if (!v) return;
    v.pause();
    v.currentTime = Math.min(Math.max(t, 0), v.duration || t);
    setTime(v.currentTime);
  }

  useEffect(() => {
    if (seek) goTo(seek.t);
  }, [seek]);

  useEffect(() => {
    if (pauseNow) ref.current?.pause();
  }, [pauseNow]);

  useEffect(() => {
    onMoment?.(paused ? time : null);
  }, [paused, time, onMoment]);

  function toggle() {
    const v = ref.current;
    if (!v) return;
    if (v.paused) void v.play();
    else v.pause();
  }

  const pct = (t: number) => (duration ? `${(Math.min(t, duration) / duration) * 100}%` : "0%");

  return (
    <div className="vplayer">
      <div className="vframe">
        <video
          ref={ref}
          src={src}
          playsInline
          preload="metadata"
          onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
          onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
          onSeeked={(e) => setTime(e.currentTarget.currentTime)}
          onPlay={() => setPaused(false)}
          onPause={() => setPaused(true)}
          onEnded={() => setPaused(true)}
        />
        {overlay?.(time, paused)}
      </div>
      <div className="vbar">
        <button type="button" className="vplay" aria-label={paused ? "Play" : "Pause"} onClick={toggle}>
          {paused ? (
            <svg viewBox="0 0 24 24">
              <path d="M7 5l12 7-12 7z" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24">
              <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" />
            </svg>
          )}
        </button>
        <div
          className="vtrack"
          role="slider"
          aria-label="Timeline"
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={Math.round(time)}
          aria-valuetext={formatVideoTime(time)}
          tabIndex={0}
          onClick={(e) => {
            if ((e.target as HTMLElement).closest(".vmark")) return;
            const r = e.currentTarget.getBoundingClientRect();
            goTo(((e.clientX - r.left) / r.width) * duration);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") goTo(time - 1);
            if (e.key === "ArrowRight") goTo(time + 1);
          }}
        >
          <div className="vfill" style={{ width: pct(time) }} />
          {markers.map((m) => (
            <button
              key={m.commentId}
              type="button"
              className={`vmark ${m.kind}${highlightedCommentId === m.commentId ? " act" : ""}`}
              style={{ left: pct(m.t) }}
              aria-label={`Comment at ${formatVideoTime(m.t)}`}
              title={formatVideoTime(m.t)}
              onClick={() => {
                goTo(m.t);
                onMarker(m.commentId);
              }}
            />
          ))}
        </div>
        <span className="vtime">
          {formatVideoTime(time)} / {formatVideoTime(duration)}
        </span>
      </div>
    </div>
  );
}
