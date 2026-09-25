import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runAiTask } from "@/lib/ai/run-ai-task";
import type { Attachment } from "@/lib/ai/attachment";

interface AttachmentRef {
  storageKey: string;
  mimeType: string;
  title: string;
}

// Anthropic's own per-request document limits are far larger than this —
// capped low and locally instead to keep one check's request body (and
// the tokens it burns against the agency's monthly cap) predictable, not
// because any real Reference Material folder is likely to hit it.
const MAX_COMBINED_ATTACHMENT_BYTES = 15 * 1024 * 1024;

// "Check WIIFM"/"Check Brand" (CreativeModal.tsx) — same shape as
// app/api/ai/draft/route.ts, plus: a file-kind Reference Material/
// Knowledge entry has no text to fold into the prompt, so the client
// sends along which ones to attach (storage key + mime type + title, not
// bytes — the client only has a *signed URL* pattern, this route reads
// the object directly from Storage with the caller's own session, which
// the assets_bucket_select policy already scopes to this agency's
// members). Only a PDF has a native "the model reads it directly" path
// (see lib/ai/attachment.ts) — anything else named here is skipped.
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  let body: { agencyId?: string; prompt?: string; attachments?: AttachmentRef[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { agencyId, prompt, attachments: attachmentRefs } = body;
  if (!agencyId || !prompt?.trim()) {
    return NextResponse.json(
      { error: "agencyId and prompt are both required" },
      { status: 400 },
    );
  }

  const { data: membership } = await supabase
    .from("memberships")
    .select("client_id")
    .eq("agency_id", agencyId)
    .eq("user_id", user.id)
    .is("removed_at", null)
    .maybeSingle();
  if (!membership || membership.client_id !== null) {
    return NextResponse.json({ error: "Staff access required" }, { status: 403 });
  }

  const attachments: Attachment[] = [];
  let combinedBytes = 0;
  for (const ref of attachmentRefs ?? []) {
    if (ref.mimeType !== "application/pdf") continue;
    const { data: blob, error: downloadError } = await supabase.storage
      .from("assets")
      .download(ref.storageKey);
    if (downloadError || !blob) {
      console.error(`Check attachment download failed for ${ref.storageKey}`, downloadError);
      continue;
    }
    if (combinedBytes + blob.size > MAX_COMBINED_ATTACHMENT_BYTES) continue;
    combinedBytes += blob.size;
    const base64 = Buffer.from(await blob.arrayBuffer()).toString("base64");
    attachments.push({ base64, mediaType: "application/pdf", title: ref.title });
  }

  const result = await runAiTask(supabase, agencyId, user.id, prompt, attachments);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ text: result.text });
}
