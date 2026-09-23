// Ported from the prototype's PLATCOL — platform chip colours in the
// calendar table's Platform column (`.pchip`).
export const PLATFORM_COLORS: Record<string, string> = {
  Instagram: "#DD2A7B",
  Facebook: "#1877F2",
  LinkedIn: "#0A66C2",
  YouTube: "#FF0000",
  Email: "#2BB65B",
  WhatsApp: "#25D366",
  Amazon: "#FF9900",
};

export function platformColor(name: string): string {
  return PLATFORM_COLORS[name] ?? "#6B7280";
}
