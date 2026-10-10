"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import {
  useKnowledgeEntries,
  type KnowledgeEntryRow,
} from "@/hooks/use-knowledge-entries";
import { useMonthlyStrategies } from "@/hooks/use-monthly-strategy";
import {
  useRefreshStrategyOverview,
  useStrategyOverviews,
  type StrategyOverviewRow,
} from "@/hooks/use-strategy-overviews";
import { filledFields, monthOf } from "@/lib/monthly-strategy";
import {
  monthBoxLabel,
  monthSection,
  monthSource,
  overviewHash,
  overviewParagraphs,
  sectionSource,
} from "@/lib/strategy-overview";

// The brand at a glance on a client's page (direct instruction: so whoever
// opens it is reminded of the brand before they start on it): its Tone of
// Voice, Target Audience and Prioritised Features from the client's
// Knowledge, with See All opening that section in Discovery. Called
// Strategy Overview (direct instruction), with a fourth box: this month's
// strategy (phase78, "Oct 2026 Strategy"), See All opening Knowledge →
// Strategy.
//
// Each box is a snapshot (phase83, decided directly): an overview Frank
// writes from everything in it, rewritten the first time someone on the
// team opens the client after it changes. Until there is one (and for
// anyone if Frank can't write it), the box shows its first entry instead.
// The boxes are a fixed height (direct instruction); an overview longer
// than its box shows in full, in its paragraphs, while it's hovered or
// focused.
const BOXES = [
  { key: "tone", label: "Tone of Voice" },
  { key: "audience", label: "Target Audience" },
  { key: "features", label: "Prioritised Features" },
] as const;

export function BrandReminder({
  clientId,
  canEdit,
}: {
  clientId: string;
  canEdit: boolean;
}) {
  const { data: entries, isPending, isError } = useKnowledgeEntries(clientId);
  const strategies = useMonthlyStrategies(clientId);
  const overviews = useStrategyOverviews(clientId);
  if (isError) return null;
  const discovery = `/clients/${clientId}/settings/knowledge`;
  return (
    <section className="brandrem" aria-label="Strategy Overview">
      <div className="secthead">
        <h2>Strategy Overview</h2>
      </div>
      <div className="brandrem-grid">
        {BOXES.map((b) => {
          const list = (entries ?? []).filter((e) => e.section === b.key);
          const head = (
            <div className="brandrem-h">
              <b>{b.label}</b>
              {list.length > 0 && (
                <Link
                  href={`${discovery}#kb-${b.key}`}
                  className="brandrem-all"
                >
                  See All
                </Link>
              )}
            </div>
          );
          return (
            <div className="brandrem-box" key={b.key}>
              {head}
              {isPending ? (
                <p className="brandrem-empty">Frank is working…</p>
              ) : list.length === 0 ? (
                <p className="brandrem-empty">
                  Nothing here yet.
                  {canEdit && (
                    <>
                      {" "}
                      <Link href={`${discovery}#kb-${b.key}`}>
                        Add it in Discovery
                      </Link>
                    </>
                  )}
                </p>
              ) : (
                <Overview
                  clientId={clientId}
                  section={b.key}
                  head={head}
                  source={sectionSource(list)}
                  overviews={overviews.data}
                  canRefresh={canEdit}
                  fallback={<Preview list={list} />}
                />
              )}
            </div>
          );
        })}
        <ThisMonth
          clientId={clientId}
          canEdit={canEdit}
          query={strategies}
          overviews={overviews.data}
        />
      </div>
    </section>
  );
}

// A box's overview: the one written, rewritten (by the team's visit) when
// what it's from has changed; the box's first entry until there is one.
function Overview({
  clientId,
  section,
  head,
  source,
  overviews,
  canRefresh,
  fallback,
}: {
  clientId: string;
  section: string;
  // The box's title and See All, repeated over the full overview.
  head: React.ReactNode;
  source: string;
  overviews: StrategyOverviewRow[] | undefined;
  canRefresh: boolean;
  fallback: React.ReactNode;
}) {
  const refresh = useRefreshStrategyOverview(clientId);
  const hash = overviewHash(source);
  const written = overviews?.find((o) => o.section === section);
  const stale = !!overviews && written?.source_hash !== hash;
  // Asked once for each version of what it's from, not on every render.
  const asked = useRef<string | null>(null);
  const { mutate } = refresh;
  useEffect(() => {
    if (!canRefresh || !stale || asked.current === hash) return;
    asked.current = hash;
    mutate(section);
  }, [canRefresh, stale, hash, section, mutate]);

  if (written) {
    const paragraphs = overviewParagraphs(written.overview).map((p, i) => <p key={i}>{p}</p>);
    return (
      <>
        {/* Focusable, so the full overview opens from the keyboard too. */}
        <div className="brandrem-ov" tabIndex={0}>
          {paragraphs}
        </div>
        {stale && refresh.isPending && (
          <p className="brandrem-also">Frank is updating this…</p>
        )}
        <div className="brandrem-full" aria-hidden="true">
          {head}
          <div className="brandrem-ov">{paragraphs}</div>
        </div>
      </>
    );
  }
  if (refresh.isPending)
    return <p className="brandrem-empty">Frank is writing an overview…</p>;
  return <>{fallback}</>;
}

// This month's strategy: its filled fields, the first few lines of each.
function ThisMonth({
  clientId,
  canEdit,
  query,
  overviews,
}: {
  clientId: string;
  canEdit: boolean;
  query: ReturnType<typeof useMonthlyStrategies>;
  overviews: StrategyOverviewRow[] | undefined;
}) {
  const month = monthOf(new Date(query.dataUpdatedAt || 0));
  const row = query.data?.find((r) => r.month === month);
  const filled = filledFields(row);
  const href = `/clients/${clientId}/settings/strategy`;
  const head = (
    <div className="brandrem-h">
      {/* "Oct 2026 Strategy" here only (direct instruction). */}
      <b>{query.data ? monthBoxLabel(month) : "This month"}</b>
      {filled.length > 0 && (
        <Link href={href} className="brandrem-all">
          See All
        </Link>
      )}
    </div>
  );
  return (
    <div className="brandrem-box">
      {head}
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
        <Overview
          clientId={clientId}
          section={monthSection(month)}
          head={head}
          source={monthSource(row)}
          overviews={overviews}
          canRefresh={canEdit}
          fallback={
            <div className="brandrem-first brandrem-month">
              {filled.slice(0, 3).map((f) => (
                <div key={f.key}>
                  <b>{f.label}</b>
                  <p>{f.value}</p>
                </div>
              ))}
              {filled.length > 3 && (
                <p className="brandrem-also">
                  Also:{" "}
                  {filled
                    .slice(3)
                    .map((f) => f.label)
                    .join(" · ")}
                </p>
              )}
            </div>
          }
        />
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
          <p className="brandrem-kind">
            {first.kind === "link" ? "A link" : "A file"}
          </p>
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
