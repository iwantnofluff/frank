import { createClient } from "@/lib/supabase/client";

// Uploads a file to the assets bucket and reports how much has gone up.
// supabase-js's storage upload has no progress, so this makes the same
// request itself with XMLHttpRequest, whose upload events do — signed in as
// the person, so storage's own rules apply exactly as they do to
// supabase.storage.from("assets").upload().
export async function uploadWithProgress(
  path: string,
  file: File,
  onProgress?: (loaded: number, total: number) => void,
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
      let message = `Upload failed (${xhr.status})`;
      try {
        message = JSON.parse(xhr.responseText).message ?? message;
      } catch {
        // Not JSON — keep the status.
      }
      reject(new Error(message));
    };
    xhr.onerror = () => reject(new Error("The upload was interrupted. Check your connection and try again."));
    xhr.send(file);
  });
}
