// A file-kind Reference Material / Knowledge entry, sent to the model
// alongside the text prompt rather than as a text note — a PDF has no
// "body" to fold into a bullet list. PDF only for now: Claude's Messages
// API reads a PDF natively (Base64PDFSource, no text extraction needed),
// which is what actually made this worth building — a DOCX/XLSX/image
// knowledge upload would need real extraction or a vision call, neither
// of which exists yet, so those kinds still contribute nothing (same as
// before this feature, not a regression from it).
export interface Attachment {
  base64: string;
  mediaType: "application/pdf";
  title: string;
}
