// The most one uploaded file can be (direct instruction: 200MB), for post
// artwork (images, and videos after compressing) and knowledge files.
// phase60 sets the storage bucket to match; Supabase's own project-wide
// limit has to allow it too (set in its dashboard, not by Frank).
export const MAX_UPLOAD_BYTES = 200 * 1024 * 1024;
export const MAX_UPLOAD_MB = 200;

// Storage's refusal, said plainly: a file over what the storage project
// allows (its own limit can sit below Frank's 200MB).
export function friendlyUploadError(message: string): string {
  return /maximum allowed size|payload too large|entity too large/i.test(message)
    ? "This file is bigger than storage accepts right now. Try a smaller file, or ask Frank support."
    : message;
}
