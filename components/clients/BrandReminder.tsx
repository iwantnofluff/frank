"use client";

import Link from "next/link";
import { useKnowledgeEntries, type KnowledgeEntryRow } from "@/hooks/use-knowledge-entries";
import { useMonthlyStrategies } from "@/hooks/use-monthly-strategy";
import { filledFields, monthLabel, monthOf } from "@/lib/monthly-strategy";

// The brand at a glance on a client's page (direct instruction: so whoever
// opens it is reminded of the brand before they start on it): its Tone of
// Voice, Target Audience and Prioritised Features from the client's
// Knowledge, each cut short, with See All opening that section in
// Discovery. Called Strategy (direct instruction), with a fourth box: this
// month's strategy (phase78), See All opening Knowledge → Strategy.
const BOXES = [
  { key: "tone", label: "Tone of Voice" },
  { key: "audience", label: "Target Audience" },
  { key: "features", label: "Prioritised Features" },
] as const;

export function BrandReminder({ clientId, canEdit }: { clientId: string; canEdit: boolean }) {
  const { data: entries, isPending, isError } = useKnowledgeEntries(clientId);
  const strategies = useMonthlyStrategies(clientId);
  if (isError) return null;
  const discovery = `/clients/${clientId}/settings/knowledge`;
  return (
    <section className="brandrem" aria-label="Strategy">
      <div className="secthead">
        <h2>Strategy</h2>
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
        <ThisMonth clientId={clientId} canEdit={canEdit} query={strategies} />
      </div>
    </section>
  );
}

// This month's strategy: its filled fields, the first few lines of each.
function ThisMonth({
  clientId,
  canEdit,
  query,
}: {
  clientId: string;
  canEdit: boolean;
  query: ReturnType<typeof useMonthlyStrategies>;
}) {
  const month = monthOf(new Date(query.dataUpdatedAt || 0));
  const filled = filledFields(query.data?.find((r) => r.month === month));
  const href = `/clients/${clientId}/settings/strategy`;
  return (
    <div className="brandrem-box">
      <div className="brandrem-h">
        <b>{query.data ? monthLabel(month) : "This month"}</b>
        {filled.length > 0 && (
          <Link href={href} className="brandrem-all">
            See All
          </Link>
        )}
      </div>
      {query.isPending ? (
        <p className="brandrem-empty">Frank is working…</p>
      ) : filled.length === 0 ? (
        <p className="brandrem-empty">
          No strategy for this month yet.
          {canEdit && (
            <>
              {" "}
              <Link href={href}>Add it in Strategy</Link>
            </>
          )}
        </p>
      ) : (
        <div className="brandrem-first brandrem-month">
          {filled.slice(0, 3).map((f) => (
            <div key={f.key}>
              <b>{f.label}</b>
              <p>{f.value}</p>
            </div>
          ))}
          {filled.length > 3 && <p className="brandrem-also">Also: {filled.slice(3).map((f) => f.label).join(" · ")}</p>}
        </div>
      )}
    </div>
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
