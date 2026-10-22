"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import type { VoicePostCurrent, VoicePostFields } from "@/lib/ai/voice-post";

// The browser's own speech-to-text (Chrome and Safari; not Firefox), not in
// TypeScript's own types.
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
type RecognitionCtor = new () => Recognition;
function recognitionCtor(): RecognitionCtor | null {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

type Phase = "idle" | "listening" | "thinking" | "done";

// Make or change a post by speaking (direct instruction): tap, say it, and
// Frank fills in the post window's fields from what was said, with one AI
// request (app/api/ai/voice-post), for checking before Create Post.
export function VoicePost({
  agencyId,
  projectId,
  delivery,
  current,
  onFill,
}: {
  agencyId: string;
  // For its team: only the project's can be put on the post.
  projectId: string;
  delivery: "scheduled" | "continuous";
  // A post already made: its brief as the window has it, so only what's
  // said changes.
  current?: VoicePostCurrent;
  onFill: (fields: VoicePostFields) => void;
}) {
  const supported = useSyncExternalStore(
    () => () => {},
    () => !!recognitionCtor(),
    () => false,
  );
  const [phase, setPhase] = useState<Phase>("idle");
  const [heard, setHeard] = useState("");
  const [hearing, setHearing] = useState("");
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<Recognition | null>(null);
  // What's been said so far, for the end of listening, whatever ends it.
  const said = useRef("");
  const sendOnEnd = useRef(false);

  if (!supported) return null;

  function start() {
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    setError(null);
    setHeard("");
    setHearing("");
    said.current = "";
    sendOnEnd.current = true;
    const r = new Ctor();
    r.lang = navigator.language || "en-GB";
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const piece = e.results[i][0].transcript;
        if (e.results[i].isFinal) said.current = `${said.current} ${piece}`.trim();
        else interim += piece;
      }
      setHeard(said.current);
      setHearing(interim);
    };
    r.onerror = (e) => {
      sendOnEnd.current = false;
      setPhase("idle");
      // Each in plain words (reported directly: a browser that offers
      // speech but can't reach its speech service, as an app's built-in
      // browser, only said "Listening stopped").
      setError(
        e.error === "not-allowed"
          ? "Frank can't hear you: allow the microphone for this site in your browser, then try again."
          : e.error === "no-speech"
            ? "Nothing was heard. Try again, a little closer to the mic."
            : e.error === "audio-capture"
              ? "No microphone was found. Plug one in or check your sound settings, then try again."
              : e.error === "network" || e.error === "service-not-allowed" || e.error === "language-not-supported"
                ? "This browser can't turn speech into text. Open Frank in Chrome or Safari to speak a post."
                : `Listening stopped (${e.error}). Try again.`,
      );
    };
    // Ends when Done is pressed, or the browser stops on its own: either
    // way, what was said is sent.
    r.onend = () => {
      rec.current = null;
      if (sendOnEnd.current) void send(said.current);
    };
    rec.current = r;
    setPhase("listening");
    r.start();
  }

  function finish() {
    rec.current?.stop();
  }

  function cancel() {
    sendOnEnd.current = false;
    rec.current?.abort();
    rec.current = null;
    setPhase("idle");
  }

  async function send(transcript: string) {
    sendOnEnd.current = false;
    setHearing("");
    if (!transcript.trim()) {
      setPhase("idle");
      setError("Nothing was heard. Try again, a little closer to the mic.");
      return;
    }
    setPhase("thinking");
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    try {
      const res = await fetch("/api/ai/voice-post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agencyId,
          projectId,
          transcript,
          delivery,
          today: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
          weekday: now.toLocaleDateString("en-GB", { weekday: "long" }),
          current,
        }),
      });
      const data = (await res.json()) as { fields?: VoicePostFields; error?: string };
      if (!res.ok || !data.fields) throw new Error(data.error ?? "Couldn't fill it in");
      if (Object.keys(data.fields).length === 0) throw new Error("Frank couldn't make out a post from that. Try again, or fill it in below.");
      onFill(data.fields);
      setPhase("done");
    } catch (e) {
      setPhase("idle");
      setError(e instanceof Error ? e.message : "Couldn't fill it in");
    }
  }

  const mic = (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
      <path d="M19 10v1a7 7 0 0 1-14 0v-1" />
      <path d="M12 18v4" />
    </svg>
  );

  return (
    <div className="voicepost">
      {phase === "listening" ? (
        <div className="voicepost-live" role="status" aria-live="polite">
          <div className="voicepost-h">
            <span className="voicepost-dot" aria-hidden="true" />
            <b>Listening…</b>
            <span className="voicepost-acts">
              <button type="button" className="btn sm" onClick={cancel}>
                Cancel
              </button>
              <button type="button" className="btn sm primary" onClick={finish}>
                Done
              </button>
            </span>
          </div>
          <p className="voicepost-t">
            {heard || hearing ? (
              <>
                {heard} <span className="voicepost-i">{hearing}</span>
              </>
            ) : (
              <span className="voicepost-i">
                {current
                  ? "Say what to change: its date, its format, who\u2019s on it, or what to add to the concept."
                  : "Say what it is, its format, when it goes out and who\u2019s on it."}
              </span>
            )}
          </p>
        </div>
      ) : (
        <div className="voicepost-row">
          <button type="button" className="btn voicepost-btn" onClick={start} disabled={phase === "thinking"}>
            {mic}
            {phase === "thinking" ? "Filling it in…" : phase === "done" ? "Say It Again" : "Speak It"}
          </button>
          <span className="voicepost-note" role="status">
            {phase === "thinking"
              ? `“${heard}”`
              : phase === "done"
                ? `Filled in from what you said. Check each field, then ${current ? "Update" : "Create Post"}.`
                : current
                  ? "Change this post by speaking: one of your monthly AI requests."
                  : "Make this post by speaking: one of your monthly AI requests."}
          </span>
        </div>
      )}
      {error && <p className="autherr">{error}</p>}
    </div>
  );
}
