// The most one uploaded file can be (direct instruction: 300MB, raised from 200MB), for post
// artwork (images, and videos after compressing) and knowledge files.
// phase66 sets the storage bucket to match; Supabase's own project-wide
// limit has to allow it too (set in its dashboard, not by Frank).
export const MAX_UPLOAD_BYTES = 300 * 1024 * 1024;
export const MAX_UPLOAD_MB = 300;

// Storage's refusal, said plainly: a file over what the storage project
// allows (its own limit can sit below Frank's limit).
export function friendlyUploadError(message: string): string {
  // The second is resumable upload's wording (checked on staging).
  return /maximum allowed size|maximum size exceeded|payload too large|entity too large/i.test(message)
    ? "This file is bigger than storage accepts right now. Try a smaller file, or ask Frank support."
    : message;
}
