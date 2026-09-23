"use client";

import { Modal } from "@/components/ui/Modal";
import { useAssetSignedUrl } from "@/hooks/use-asset-signed-url";

// Ports the intent behind the prototype's in-app "reader" for a Reference
// Material item, against what this schema can actually show. A PDF or
// image renders inline (an <iframe> onto a real PDF gets native
// scroll/zoom/search from the browser's own PDF viewer for free — no
// PDF.js dependency to add); anything else (DOCX/XLSX/CSV) has no inline
// renderer available without one, so it gets a plain download link
// instead of a fake preview.
export function KnowledgeFilePreviewModal({
  storageKey,
  filename,
  mimeType,
  onClose,
}: {
  storageKey: string;
  filename: string;
  mimeType: string;
  onClose: () => void;
}) {
  const { data: signedUrl, isLoading, isError } = useAssetSignedUrl(storageKey);

  const isPdf = mimeType === "application/pdf";
  const isImage = mimeType.startsWith("image/");

  return (
    <Modal title={filename} onClose={onClose}>
      {isLoading && <p className="sub">Loading…</p>}
      {isError && (
        <div className="empty">
          <b>Couldn&rsquo;t load this file</b>
        </div>
      )}
      {signedUrl && isPdf && (
        <iframe
          src={signedUrl}
          title={filename}
          style={{ width: "100%", height: "70vh", border: "1px solid var(--line)", borderRadius: "var(--r)" }}
        />
      )}
      {/* A signed, expiring Storage URL isn't a fit for next/image's static
          optimisation — same reasoning as the creative-review preview. */}
      {signedUrl && isImage && (
        <img src={signedUrl} alt={filename} style={{ maxWidth: "100%", borderRadius: "var(--r)" }} />
      )}
      {signedUrl && !isPdf && !isImage && (
        <div className="empty">
          <b>No inline preview for this file type</b>
          <span>
            <a href={signedUrl} target="_blank" rel="noreferrer" download={filename}>
              Download {filename}
            </a>
          </span>
        </div>
      )}
    </Modal>
  );
}
