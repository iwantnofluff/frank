import { Upload, type DetailedError } from "tus-js-client";
import { createClient } from "@/lib/supabase/client";
import { friendlyUploadError } from "@/lib/upload-limits";

// Uploads a file to the assets bucket and reports how much has gone up.
// Through Supabase's resumable upload (TUS), in 6MB pieces, the size
// Supabase requires (reported directly: a heavy video's bar wasn't in step
// with the upload). The bar counts what storage has confirmed, so it can't
// run ahead of the upload or sit at 100% while one big request finishes. A
// dropped connection carries on from the last confirmed piece instead of
// starting the whole file again. Signed in as the person, so storage's own
// rules apply exactly as they do to supabase.storage.from("assets").upload().
const CHUNK = 6 * 1024 * 1024;

export async function uploadWithProgress(
  path: string,
  file: File,
  onProgress?: (loaded: number, total: number) => void,
  // Called when the connection drops and the upload is about to try again,
  // so the bar can say so rather than freeze.
  onRetry?: () => void,
): Promise<void> {
  const supabase = createClient();
  let accepted = 0;
  let tried = false;

  await new Promise<void>((resolve, reject) => {
    const upload = new Upload(file, {
      endpoint: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/upload/resumable`,
      chunkSize: CHUNK,
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      // Tried again after a dropped connection or a server error, waiting a
      // little longer each time; a refusal (too big, not allowed) isn't.
      retryDelays: [0, 2000, 5000, 10000, 20000],
      headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, "x-upsert": "false" },
      metadata: { bucketName: "assets", objectName: path, contentType: file.type || "application/octet-stream", cacheControl: "3600" },
      // Each request with the current session: a long upload can outlast the
      // one it started with.
      onBeforeRequest: async (req) => {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session) throw new Error("Not signed in");
        req.setHeader("authorization", `Bearer ${session.access_token}`);
      },
      onShouldRetry: (err, attempt, options) => {
        tried = true;
        const status = err.originalResponse?.getStatus() ?? 0;
        const retry = attempt < (options.retryDelays?.length ?? 0) && (status === 0 || status >= 500);
        if (retry) onRetry?.();
        return retry;
      },
      // Moves as each piece is sent, but only reaches the end once storage
      // has confirmed the last one.
      onProgress: (sent, total) => onProgress?.(sent >= total && accepted < total ? total * 0.99 : sent, total),
      onChunkComplete: (_size, bytesAccepted, total) => {
        accepted = bytesAccepted;
        onProgress?.(bytesAccepted, total);
      },
      onSuccess: () => resolve(),
      onError: (err) => {
        const detailed = err as DetailedError;
        const status = detailed.originalResponse?.getStatus() ?? 0;
        const body = detailed.originalResponse?.getBody() ?? "";
        // A retry finding the file already there: an earlier send reached
        // storage and only its answer was lost. The path is this upload's
        // own (a fresh random id), and storage only keeps a whole file.
        if (tried && status === 409) return resolve();
        let message = err.message;
        try {
          message = (JSON.parse(body) as { message?: string }).message ?? message;
        } catch {
          // Not JSON: storage's own words if short, else tus's message.
          if (body && body.length < 300) message = body;
        }
        if (status === 0 && !body) message = "The upload was interrupted. Check your connection and try again.";
        reject(new Error(friendlyUploadError(message)));
      },
    });
    upload.start();
  });
}
