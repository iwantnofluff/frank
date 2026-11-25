export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Crop {
  x: number;
  y: number;
  size: number;
}

// How much of the picture around the detected face to keep. The detector's
// box is roughly brow-to-chin and ear-to-ear; 1.7x that is the whole head,
// hair to chin, with a little margin — per direct instruction, the head
// only, not head-and-shoulders.
export const HEAD_SCALE = 1.7;
// The box sits low on the head (it starts at the brows), so the crop's
// centre is lifted by this fraction of the box height to leave room for hair.
export const HEAD_LIFT = 0.12;

function clamp(n: number, min: number, max: number) {
  return Math.min(Math.max(n, min), max);
}

// A logo can be zoomed out past filling the square (direct instruction), up
// to maxSize: then the square is wider than the picture that way, and the
// picture moves about inside it rather than the square inside the picture.
export function clampCrop(c: Crop, imageW: number, imageH: number, maxSize = Math.min(imageW, imageH)): Crop {
  const size = clamp(c.size, 1, Math.max(maxSize, Math.min(imageW, imageH)));
  return {
    size,
    x: clamp(c.x, Math.min(0, imageW - size), Math.max(0, imageW - size)),
    y: clamp(c.y, Math.min(0, imageH - size), Math.max(0, imageH - size)),
  };
}

// A square around the face if there is one; otherwise the largest centred
// square, so a photo with no detectable face still gets a sensible start.
export function initialCrop(imageW: number, imageH: number, face: Box | null): Crop {
  if (!face) {
    const size = Math.min(imageW, imageH);
    return { size, x: (imageW - size) / 2, y: (imageH - size) / 2 };
  }
  const size = Math.max(face.width, face.height) * HEAD_SCALE;
  const cx = face.x + face.width / 2;
  const cy = face.y + face.height / 2 - face.height * HEAD_LIFT;
  return clampCrop({ size, x: cx - size / 2, y: cy - size / 2 }, imageW, imageH);
}

// Zooming keeps the square centred on the same point of the photo.
export function resizeCrop(c: Crop, size: number, imageW: number, imageH: number, maxSize?: number): Crop {
  const cx = c.x + c.size / 2;
  const cy = c.y + c.size / 2;
  return clampCrop({ size, x: cx - size / 2, y: cy - size / 2 }, imageW, imageH, maxSize);
}

// Of several faces, the most prominent one — biggest box — is the subject.
export function pickFace(boxes: Box[]): Box | null {
  if (boxes.length === 0) return null;
  return boxes.reduce((best, b) => (b.width * b.height > best.width * best.height ? b : best));
}
