"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { formatVideoTime } from "@/lib/annotations";
import { avatarColour } from "@/lib/avatar-colour";
import { VideoSafeZones } from "./SafeZoneOverlay";
import { captureFrame } from "@/lib/video-frame";

export interface TimelineMarker {
  commentId: string;
  t: number;
  kind: "pin" | "region" | "time";
  // Who made it and what it says, for the card shown on hover (direct
  // instruction).
  author?: string;
  body?: string;
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
  ratio,
  expandable = false,
  cover,
  frameAction,
}: {
  // Not yet known while the file's address is fetched: the player is
  // drawn at its size anyway, so nothing moves when the video arrives.
  src: string | undefined;
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
  // Width over height before the video has loaded: the post's format's
  // (direct instruction: no jump to the real height). The video's own
  // takes over once known, if different.
  ratio: number;
  // A video's thumbnail (phase118, direct instruction): shown over the
  // frame, as the platform shows a cover, until it's first played.
  cover?: string | null;
  // A Reel's (direct instruction): a button over the frame's top right
  // that fills the phone's screen with it, as the app does — the phone's,
  // not the computer's (direct instruction).
  expandable?: boolean;
  // Use a paused frame (direct instruction: a Reel's thumbnail from its
  // video): a button in the bar while paused, then a check of the frame
  // before `onUse` takes it. The team's, where the post has a thumbnail.
  frameAction?: {
    // The button's words and its confirm's ("Use as Thumbnail", "Save as V3").
    label: string;
    confirmLabel: string;
    onUse: (file: File, t: number) => Promise<void> | void;
  };
}) {
  const ref = useRef<HTMLVideoElement>(null);
  // The frame being checked before it's used: its image, file and moment.
  const [frame, setFrame] = useState<{ url: string; file: File; t: number } | null>(null);
  const [frameBusy, setFrameBusy] = useState(false);
  const [frameError, setFrameError] = useState<string | null>(null);
  useEffect(() => () => {
    if (frame) URL.revokeObjectURL(frame.url);
  }, [frame]);
  async function takeFrame() {
    const v = ref.current;
    if (!v) return;
    setFrameError(null);
    try {
      const file = await captureFrame(v);
      setFrame({ url: URL.createObjectURL(file), file, t: v.currentTime });
    } catch (e) {
      setFrameError(e instanceof Error ? e.message : "This frame couldn't be copied.");
    }
  }
  async function confirmFrame() {
    if (!frame || !frameAction) return;
    setFrameBusy(true);
    setFrameError(null);
    try {
      await frameAction.onUse(frame.file, frame.t);
      setFrame(null);
    } catch (e) {
      setFrameError(e instanceof Error ? e.message : "It couldn't be saved.");
    } finally {
      setFrameBusy(false);
    }
  }
  // Paused, ← and → step a frame at a time (about 1/30s), to land on the
  // exact one; kept to this player.
  function stepKeys(e: React.KeyboardEvent) {
    if (!frameAction || !paused || frame) return;
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    if ((e.target as HTMLElement).closest(".vtrack, input, textarea")) return;
    e.preventDefault();
    e.stopPropagation();
    goTo(time + (e.key === "ArrowRight" ? 1 : -1) / 30);
  }
  const [full, setFull] = useState(false);
  const [ownRatio, setOwnRatio] = useState<number | null>(null);
  const r = ownRatio ?? ratio;
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [paused, setPaused] = useState(true);
  // Once played, or taken to a comment's moment, the video itself, not the
  // cover. (Not on its time: the first frame is drawn at 0.001s.)
  const [started, setStarted] = useState(false);
  const [seekSeen, setSeekSeen] = useState(seek?.nonce ?? null);
  if (seek && seek.nonce !== seekSeen) {
    setSeekSeen(seek.nonce);
    setStarted(true);
  }
  // The marker whose card is showing (hovered or focused).
  const [peek, setPeek] = useState<string | null>(null);

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

  // Back ten seconds (direct instruction), still playing if it was.
  function back10() {
    const v = ref.current;
    if (!v) return;
    v.currentTime = Math.max(0, v.currentTime - 10);
    setTime(v.currentTime);
  }

  function toggle() {
    const v = ref.current;
    if (!v) return;
    if (v.paused) void v.play();
    else v.pause();
  }

  // Esc puts an expanded video back.
  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFull(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [full]);

  const pct = (t: number) => (duration ? `${(Math.min(t, duration) / duration) * 100}%` : "0%");

  return (
    <div className={`vplayer${full ? " full" : ""}`} style={{ "--vr": r } as CSSProperties} onKeyDown={stepKeys}>
      {/* Sized from the shape, not from the loaded video (.vframe): as wide
          as fits, no taller than 62% of the screen, or a Story's screen. */}
      <div className="vframe" style={{ "--vr": r } as CSSProperties}>
        {/* Stays in view below the phone's top bar while the video
            scrolls under it (direct instruction), until the video's gone. */}
        {expandable && (
          <div className="vexpand-stick">
            <button
              type="button"
              className="vexpand"
              aria-label={full ? "Collapse video" : "Expand video"}
              title={full ? "Collapse" : "Expand"}
              onClick={(e) => {
                e.stopPropagation();
                setFull((f) => !f);
              }}
            >
              {full ? (
                <svg viewBox="0 0 24 24">
                  <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24">
                  <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
                </svg>
              )}
            </button>
          </div>
        )}
        <video
          ref={ref}
          // Its first frame shows before it plays (reported directly: a black
          // screen until Play on a phone). Phones, iPhones above all, don't
          // draw a frame from metadata alone; asking for the first moment
          // makes them load and show it.
          src={src ? `${src}#t=0.001` : src}
          // So a paused frame can be copied (frameAction): storage allows
          // any origin, and no cookies are sent.
          crossOrigin="anonymous"
          playsInline
          preload="metadata"
          style={{ width: "100%", aspectRatio: String(r) }}
          onLoadedMetadata={(e) => {
            setDuration(e.currentTarget.duration || 0);
            const { videoWidth: w, videoHeight: h } = e.currentTarget;
            if (w && h) setOwnRatio(w / h);
          }}
          onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
          onSeeked={(e) => setTime(e.currentTarget.currentTime)}
          onPlay={() => {
            setPaused(false);
            setStarted(true);
          }}
          onPause={() => setPaused(true)}
          onEnded={() => setPaused(true)}
        />
        {cover && !started && (
          // eslint-disable-next-line @next/next/no-img-element -- a short-lived signed URL
          <img className="vcover" src={cover} alt="" aria-hidden="true" />
        )}
        {overlay?.(time, paused)}
        {/* Safe Zones, when the post page's Fullscreen has them on. */}
        <VideoSafeZones />
      </div>
      <div className="vbar">
        <button type="button" className="vplay" aria-label="Back 10 seconds" title="Back 10 seconds" onClick={back10}>
          <svg viewBox="0 0 24 24" className="vback">
            <path d="M12 5V2L7.5 6 12 10V7a6 6 0 1 1-6 6H4a8 8 0 1 0 8-8z" />
            <text x="12" y="15.7" textAnchor="middle">
              10
            </text>
          </svg>
        </button>
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
              aria-label={`Comment at ${formatVideoTime(m.t)}${m.author ? ` by ${m.author}` : ""}`}
              onMouseEnter={() => setPeek(m.commentId)}
              onMouseLeave={() => setPeek((p) => (p === m.commentId ? null : p))}
              onFocus={() => setPeek(m.commentId)}
              onBlur={() => setPeek((p) => (p === m.commentId ? null : p))}
              onClick={() => {
                goTo(m.t);
                onMarker(m.commentId);
              }}
            />
          ))}
          {(() => {
            const m = markers.find((x) => x.commentId === peek);
            if (!m || !m.body) return null;
            // Kept inside the bar near either end.
            const at = duration ? Math.min(m.t, duration) / duration : 0;
            const side = at < 0.2 ? "start" : at > 0.8 ? "end" : "mid";
            return (
              <div className={`vpeek ${side}`} style={{ left: pct(m.t) }} role="tooltip">
                <div className="vpeek-h">
                  <span className="who" style={{ background: avatarColour(m.author ?? "Someone") }}>
                    {(m.author ?? "Someone").slice(0, 1).toUpperCase()}
                  </span>
                  <b>{m.author ?? "Someone"}</b>
                  <span className="t">{formatVideoTime(m.t)}</span>
                </div>
                <p>{m.body}</p>
              </div>
            );
          })()}
        </div>
        <span className="vtime">
          {formatVideoTime(time)} / {formatVideoTime(duration)}
        </span>
        {frameAction && paused && (started || !cover) && (
          <button
            type="button"
            className="vplay vframe-pick"
            aria-label={frameAction.label}
            title={`${frameAction.label} (← → step a frame)`}
            onClick={() => void takeFrame()}
          >
            <svg viewBox="0 0 24 24">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="M21 15l-5-5L5 21" />
            </svg>
          </button>
        )}
      </div>
      {/* The frame, checked before it's used; nothing happens until then. */}
      {(frame || frameError) && (
        <div className="vframe-pop" role="dialog" aria-label={frameAction?.label}>
          {frame && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element -- a local preview */}
              <img src={frame.url} alt={`The frame at ${formatVideoTime(frame.t)}`} />
              <span className="vframe-pop-t">{`${frameAction?.label ?? "Frame"} from ${formatVideoTime(frame.t)}`}</span>
            </>
          )}
          {frameError && <p className="autherr tiny">{frameError}</p>}
          <div className="vframe-pop-acts">
            <button
              type="button"
              className="btn sm"
              disabled={frameBusy}
              onClick={() => {
                setFrame(null);
                setFrameError(null);
              }}
            >
              Cancel
            </button>
            {frame && (
              <button type="button" className="btn sm primary" disabled={frameBusy} onClick={() => void confirmFrame()}>
                {frameBusy ? "Saving…" : frameAction?.confirmLabel}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
