// Compressing a video in the browser before it's uploaded. Decided
// directly: review copies at 720p (the short side), roughly 4–5MB for a
// 30-second Reel, and only the compressed copy is kept — the agency keeps
// its own master for publishing. Uses the browser's own (usually
// hardware) encoder through Mediabunny, loaded only when a video is
// uploaded. docs/parity-gaps.md.

const SHORT_SIDE = 720;
const VIDEO_BITRATE = 1_100_000; // ~1.1 Mbps
const AUDIO_BITRATE = 96_000;

export type CompressResult =
  | { kind: "compressed"; file: File; before: number; after: number }
  // The browser can't encode H.264, or the result wasn't any smaller.
  | { kind: "unchanged"; file: File; reason: "unsupported" | "not-smaller" };

export async function compressVideo(file: File, onProgress?: (fraction: number) => void): Promise<CompressResult> {
  const mb = await import("mediabunny");
  if (typeof VideoEncoder === "undefined" || !(await mb.canEncodeVideo("avc"))) {
    return { kind: "unchanged", file, reason: "unsupported" };
  }

  const input = new mb.Input({ source: new mb.BlobSource(file), formats: mb.ALL_FORMATS });
  const track = await input.getPrimaryVideoTrack();
  if (!track) return { kind: "unchanged", file, reason: "unsupported" };
  const w = track.displayWidth;
  const h = track.displayHeight;
  // Only ever smaller: the short side down to 720, the other side following
  // (Mediabunny keeps the aspect ratio when only one side is given).
  const size = Math.min(w, h) > SHORT_SIDE ? (w <= h ? { width: SHORT_SIDE } : { height: SHORT_SIDE }) : {};

  const output = new mb.Output({
    // Index at the front, so the video can start playing before it has
    // all downloaded.
    format: new mb.Mp4OutputFormat({ fastStart: "in-memory" }),
    target: new mb.BufferTarget(),
  });
  const conversion = await mb.Conversion.init({
    input,
    output,
    video: { ...size, codec: "avc", bitrate: VIDEO_BITRATE, forceTranscode: true },
    audio: (await mb.canEncodeAudio("aac")) ? { codec: "aac", bitrate: AUDIO_BITRATE } : undefined,
  });
  // Never accept a copy without its picture: if the video track would be
  // dropped (a codec this browser can't decode, say), keep the original.
  const droppedVideo = conversion.discardedTracks.filter((d) => d.track.type === "video");
  if (!conversion.isValid || droppedVideo.length) {
    console.warn("Video not compressed:", droppedVideo.map((d) => d.reason).join(", ") || "invalid conversion");
    return { kind: "unchanged", file, reason: "unsupported" };
  }
  conversion.onProgress = (p) => onProgress?.(p);
  await conversion.execute();

  const buffer = output.target.buffer;
  if (!buffer || buffer.byteLength >= file.size) return { kind: "unchanged", file, reason: "not-smaller" };
  const name = file.name.replace(/\.[^.]+$/, "") + ".mp4";
  return { kind: "compressed", file: new File([buffer], name, { type: "video/mp4" }), before: file.size, after: buffer.byteLength };
}
