"use client";

import Link from "next/link";
import { useKnowledgeEntries, type KnowledgeEntryRow } from "@/hooks/use-knowledge-entries";

// The brand at a glance on a client's page (direct instruction: so whoever
// opens it is reminded of the brand before they start on it): its Tone of
// Voice, Target Audience and Prioritised Features from the client's
// Knowledge, each cut short, with See All opening that section in
// Discovery.
const BOXES = [
  { key: "tone", label: "Tone of Voice" },
  { key: "audience", label: "Target Audience" },
  { key: "features", label: "Prioritised Features" },
] as const;

export function BrandReminder({ clientId, canEdit }: { clientId: string; canEdit: boolean }) {
  const { data: entries, isPending, isError } = useKnowledgeEntries(clientId);
  if (isError) return null;
  const discovery = `/clients/${clientId}/settings/knowledge`;
  return (
    <section className="brandrem" aria-label="About the brand">
      <div className="secthead">
        <h2>About the brand</h2>
      </div>
      <div className="brandrem-grid">
        {BOXES.map((b) => {
          const list = (entries ?? []).filter((e) => e.section === b.key);
          return (
            <div className="brandrem-box" key={b.key}>
              <div className="brandrem-h">
                <b>{b.label}</b>
                {list.length > 0 && (
                  <Link href={`${discovery}#kb-${b.key}`} className="brandrem-all">
                    See All
                  </Link>
                )}
              </div>
              {isPending ? (
                <p className="brandrem-empty">Frank is working…</p>
              ) : list.length === 0 ? (
                <p className="brandrem-empty">
                  Nothing here yet.
                  {canEdit && (
                    <>
                      {" "}
                      <Link href={`${discovery}#kb-${b.key}`}>Add it in Discovery</Link>
                    </>
                  )}
                </p>
              ) : (
                <Preview list={list} />
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

// The first entry, its words cut to a few lines; then the others by name.
function Preview({ list }: { list: KnowledgeEntryRow[] }) {
  const [first, ...rest] = list;
  const shown = rest.slice(0, 3);
  const more = rest.length - shown.length;
  return (
    <>
      <div className="brandrem-first">
        {first.title && <b>{first.title}</b>}
        {first.kind === "text" && first.body ? (
          <p>{first.body}</p>
        ) : (
          <p className="brandrem-kind">{first.kind === "link" ? "A link" : "A file"}</p>
        )}
      </div>
      {shown.length > 0 && (
        <p className="brandrem-also">
          Also: {shown.map((e) => e.title || "Untitled").join(" · ")}
          {more > 0 && ` · ${more} more`}
        </p>
      )}
    </>
  );
}
