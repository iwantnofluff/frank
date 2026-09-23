// Knowledge files are reference documents (Ca$hvertising, brand research,
// a moodboard image), not creative artwork — a different accepted-type
// list from lib/upload-validation.ts (which is image/video only, scoped
// to creatives). Types match what the prototype's own Add Knowledge
// dialog names for its file/image sections.
const ACCEPTED_DOC_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
];
const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 25 * 1024 * 1024;

export function validateKnowledgeFile(
  file: File,
): { ok: true } | { ok: false; message: string } {
  const isDoc = ACCEPTED_DOC_TYPES.includes(file.type);
  const isImage = ACCEPTED_IMAGE_TYPES.includes(file.type);

  if (!isDoc && !isImage) {
    return {
      ok: false,
      message: "Accepted formats: PDF, DOC, DOCX, XLS, XLSX, CSV, JPG, PNG, WebP.",
    };
  }

  if (file.size > MAX_BYTES) {
    return { ok: false, message: "Files must be 25MB or smaller." };
  }

  return { ok: true };
}

export const KNOWLEDGE_FILE_EXTENSIONS =
  ".pdf,.doc,.docx,.xls,.xlsx,.csv,.jpg,.jpeg,.png,.webp";
