// A comment the team logs for the client (phase149, direct instruction):
// feedback the client gave outside Frank, written in by someone on the
// team. Shown as the client's, "via" whoever logged it, and where from.

export const CLIENT_SOURCES = [
  { id: "phone", label: "Phone" },
  { id: "whatsapp", label: "WhatsApp" },
  { id: "email", label: "Email" },
  { id: "meeting", label: "Meeting" },
] as const;

export type ClientSource = (typeof CLIENT_SOURCES)[number]["id"];

export function clientSourceLabel(source: string | null | undefined): string | null {
  return CLIENT_SOURCES.find((s) => s.id === source)?.label ?? null;
}

// "via Raj Rana (WhatsApp)", or "via Raj Rana" with no source.
export function viaText(name: string, source: string | null | undefined): string {
  const from = clientSourceLabel(source);
  return `via ${name}${from ? ` (${from})` : ""}`;
}
