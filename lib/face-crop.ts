import type { FaceDetector } from "@mediapipe/tasks-vision";
import { pickFace, type Box, type Crop } from "./face-crop-math";

// Browser-only. MediaPipe (~3-4 MB over the wire, most of it the .wasm
// runtime) is imported on first use, not bundled into every page — only
// someone actually picking a profile photo downloads it. Runtime and model
// are both served from this app (see scripts/copy-mediapipe-wasm.mjs).
let detector: Promise<FaceDetector> | null = null;

// MediaPipe's WebAssembly runtime writes its own routine start-up logging
// ("INFO: Created TensorFlow Lite XNNPACK delegate for CPU.", glog-style
// "W1001 …" lines) through console.error/warn, which Next's dev overlay
// counts as an "Issue". Only lines in those two formats are dropped, only
// while MediaPipe is running — anything else still gets through.
const MEDIAPIPE_LOG = /^(INFO: |[IWE]\d{4} \d)/;
async function quietMediaPipe<T>(run: () => Promise<T> | T): Promise<T> {
  const { error, warn } = console;
  const filter =
    (original: (...args: unknown[]) => void) =>
    (...args: unknown[]) => {
      if (typeof args[0] === "string" && MEDIAPIPE_LOG.test(args[0])) return;
      original.apply(console, args);
    };
  console.error = filter(error);
  console.warn = filter(warn);
  try {
    return await run();
  } finally {
    console.error = error;
    console.warn = warn;
  }
}

function loadDetector() {
  detector ??= quietMediaPipe(async () => {
    const { FaceDetector, FilesetResolver } = await import("@mediapipe/tasks-vision");
    const fileset = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
    return FaceDetector.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: "/mediapipe/blaze_face_short_range.tflite", delegate: "CPU" },
      runningMode: "IMAGE",
    });
  });
  // A failed load shouldn't stick: let the next photo try again.
  detector.catch(() => {
    detector = null;
  });
  return detector;
}

// null means "no face found" — and also "couldn't run detection at all"; in
// both cases the cropper falls back to a centred square the person adjusts.
export async function detectFace(img: HTMLImageElement): Promise<Box | null> {
  try {
    const d = await loadDetector();
    const result = await quietMediaPipe(() => d.detect(img));
    const boxes = result.detections.map((det) => det.boundingBox)
      .filter((b): b is NonNullable<typeof b> => !!b)
      .map((b) => ({ x: b.originX, y: b.originY, width: b.width, height: b.height }));
    return pickFace(boxes);
  } catch {
    return null;
  }
}

export function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That file couldn't be opened as an image"));
    };
    img.src = url;
  });
}

export const AVATAR_OUTPUT_PX = 512;

// The cropped square, resized to 512 px — JPEG by default, so what's stored
// is small and consistent however large the original was. Client images
// ask for PNG when the source is PNG, to keep a logo's transparency.
export function cropToFile(
  img: HTMLImageElement,
  crop: Crop,
  type: "image/jpeg" | "image/png" = "image/jpeg",
): Promise<File> {
  const canvas = document.createElement("canvas");
  canvas.width = AVATAR_OUTPUT_PX;
  canvas.height = AVATAR_OUTPUT_PX;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.reject(new Error("Couldn't prepare the photo"));
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, crop.x, crop.y, crop.size, crop.size, 0, 0, AVATAR_OUTPUT_PX, AVATAR_OUTPUT_PX);
  const ext = type === "image/png" ? "png" : "jpg";
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(new File([blob], `cropped.${ext}`, { type }))
          : reject(new Error("Couldn't prepare the photo")),
      type,
      0.9,
    );
  });
}
