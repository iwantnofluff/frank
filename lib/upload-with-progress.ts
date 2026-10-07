import { createClient } from "@/lib/supabase/client";
import { friendlyUploadError } from "@/lib/upload-limits";

// Uploads a file to the assets bucket and reports how much has gone up.
// supabase-js's storage upload has no progress, so this makes the same
// request itself with XMLHttpRequest, whose upload events do — signed in as
// the person, so storage's own rules apply exactly as they do to
// supabase.storage.from("assets").upload().
// A dropped connection or a server error is tried again, twice, after a
// short wait (reported directly: a large video needed Save pressing several
// times). A refusal (too big, not allowed) isn't: trying again won't help.
export async function uploadWithProgress(
  path: string,
  file: File,
  onProgress?: (loaded: number, total: number) => void,
): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await uploadOnce(path, file, onProgress, attempt > 1);
    } catch (e) {
      if (!(e instanceof RetryableUploadError) || attempt === 3) throw e;
      onProgress?.(0, file.size);
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
}

class RetryableUploadError extends Error {}

async function uploadOnce(
  path: string,
  file: File,
  onProgress: ((loaded: number, total: number) => void) | undefined,
  retrying: boolean,
): Promise<void> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("Not signed in");

  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/assets/${path
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.setRequestHeader("authorization", `Bearer ${session.access_token}`);
    xhr.setRequestHeader("apikey", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    xhr.setRequestHeader("content-type", file.type || "application/octet-stream");
    xhr.setRequestHeader("cache-control", "max-age=3600");
    xhr.setRequestHeader("x-upsert", "false");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded, e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      // A retry finding the file already there: the earlier send reached
      // storage and only its answer was lost. The path is this upload's
      // own (a fresh random id), and storage only keeps a whole file.
      // Storage says so as a 400 whose body names it (checked).
      if (retrying && /KeyAlreadyExists|"409"/.test(xhr.responseText)) return resolve();
      let message = `Upload failed (${xhr.status})`;
      try {
        message = JSON.parse(xhr.responseText).message ?? message;
      } catch {
        // Not JSON — keep the status.
      }
      const error = friendlyUploadError(message);
      reject(xhr.status >= 500 || xhr.status === 0 ? new RetryableUploadError(error) : new Error(error));
    };
    xhr.onerror = () =>
      reject(new RetryableUploadError("The upload was interrupted. Check your connection and try again."));
    xhr.send(file);
  });
}
