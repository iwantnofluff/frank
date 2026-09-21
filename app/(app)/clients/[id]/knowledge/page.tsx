"use client";

import { use } from "react";
import { useClientDetail } from "@/hooks/use-client";
import { useKnowledgeEntries } from "@/hooks/use-knowledge-entries";
import { useIsStaff } from "@/hooks/use-is-staff";
import { KnowledgeSection } from "@/components/knowledge/KnowledgeSection";
import { KNOWLEDGE_SECTIONS } from "@/lib/knowledge-sections";

export default function ClientKnowledgePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data: client } = useClientDetail(id);
  const { data: entries, isLoading, isError } = useKnowledgeEntries(id);
  // knowledge_entries' write policies were already staff-only before this
  // session touched anything — the UI just never matched them. Fails
  // closed while still resolving, same as every other isStaff gate.
  const { isStaff, isPending: isStaffPending } = useIsStaff();
  const confirmedStaff = isStaff && !isStaffPending;

  const filledCount = KNOWLEDGE_SECTIONS.filter((s) =>
    entries?.some((e) => e.section === s.key),
  ).length;

  return (
    <div className="pad">
      <h1 className="h1">Knowledge</h1>
      <p className="sub">
        {client?.name ?? "This client"} · {filledCount} of{" "}
        {KNOWLEDGE_SECTIONS.length} areas filled
        {filledCount < KNOWLEDGE_SECTIONS.length &&
          " — this is what determines how much the checks can do"}
      </p>

      {isError && (
        <div className="empty">
          <b>Couldn&rsquo;t load the knowledge folder</b>
        </div>
      )}

      {!isError && (
        <div className="kbgrid">
          {isLoading
            ? null
            : KNOWLEDGE_SECTIONS.map((section) => (
                <KnowledgeSection
                  key={section.key}
                  clientId={id}
                  sectionKey={section.key}
                  label={section.label}
                  entries={
                    entries?.filter((e) => e.section === section.key) ?? []
                  }
                  isStaff={confirmedStaff}
                />
              ))}
        </div>
      )}
    </div>
  );
}
