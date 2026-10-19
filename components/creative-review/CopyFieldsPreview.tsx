import { copySummaryParts } from "@/lib/formats";

// A post's copy other than a caption, where the preview would show a
// caption (direct instruction: a listing's Title, Bullet Points and
// Description, reviewed with its images). Each under its name, line breaks
// as written. Nothing when there's none.
export function CopyFieldsPreview({ fields, formatIds }: { fields: Record<string, string> | null | undefined; formatIds: string[] }) {
  const others = fields ? copySummaryParts(fields, formatIds).others : [];
  if (!others.length) return null;
  return (
    <span className="ig-fields">
      {others.map((o) => (
        <span className="ig-field" key={o.label}>
          <b>{o.label}</b>
          <span>{o.text}</span>
        </span>
      ))}
    </span>
  );
}
