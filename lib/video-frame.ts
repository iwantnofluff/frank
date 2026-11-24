// A video's paused frame as an image (direct instruction: pick a Reel's
// thumbnail from its video), at the video's own size, as a JPEG. The video
// must allow it (crossOrigin "anonymous", and storage's CORS, which
// Supabase Storage sends as *); a tainted frame throws.

const QUALITY = 0.92;

// "0:07" → "frame-0m07s.jpg"; tenths kept, so two frames a moment apart
// don't share a name.
export function frameFileName(t: number): string {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  const whole = Math.floor(s);
  const tenth = Math.floor((s - whole) * 10);
  return `frame-${m}m${String(whole).padStart(2, "0")}${tenth ? `.${tenth}` : ""}s.jpg`;
}

export async function captureFrame(video: HTMLVideoElement): Promise<File> {
  const { videoWidth: w, videoHeight: h, currentTime } = video;
  if (!w || !h) throw new Error("The video hasn't loaded yet. Play it for a moment, then try again.");
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.drawImage(video, 0, 0, w, h);
  const blob = await new Promise<Blob | null>((resolve) => {
    try {
      canvas.toBlob(resolve, "image/jpeg", QUALITY);
    } catch {
      resolve(null);
    }
  });
  if (!blob) throw new Error("This frame couldn't be copied from the video. Upload a thumbnail image instead.");
  return new File([blob], frameFileName(currentTime), { type: "image/jpeg" });
}
