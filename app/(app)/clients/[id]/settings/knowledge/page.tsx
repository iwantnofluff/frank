"use client";

import { use, useEffect } from "react";
import { useClientDetail } from "@/hooks/use-client";
import { useKnowledgeEntries } from "@/hooks/use-knowledge-entries";
import { useIsStaff } from "@/hooks/use-is-staff";
import { useMyAgency } from "@/hooks/use-my-agency";
import { KnowledgeSection } from "@/components/knowledge/KnowledgeSection";
import { KNOWLEDGE_SECTIONS } from "@/lib/knowledge-sections";
import { SettingsHead } from "@/components/settings/SettingsHead";

export default function ClientSettingsKnowledgePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data: client } = useClientDetail(id);
  const { data: agency } = useMyAgency();
  const { data: entries, isLoading, isError } = useKnowledgeEntries(id);
  // knowledge_entries' write policies were already staff-only before this
  // session touched anything — the UI just never matched them. Fails
  // closed while still resolving, same as every other isStaff gate.
  const { isStaff, isPending: isStaffPending } = useIsStaff();
  const confirmedStaff = isStaff && !isStaffPending;

  // Opened from See All on the client's page: to that section once it's
  // there to scroll to.
  const loaded = !isLoading && !isError;
  useEffect(() => {
    if (!loaded || !window.location.hash.startsWith("#kb-")) return;
    document.getElementById(window.location.hash.slice(1))?.scrollIntoView({ block: "start" });
  }, [loaded]);

  const filledCount = KNOWLEDGE_SECTIONS.filter((s) =>
    entries?.some((e) => e.section === s.key),
  ).length;

  // Client Settings → Knowledge (direct instruction: moved here from the
  // rail). The same structure, padding and spacing as Settings' Reference
  // Material: its heading, then the areas stacked as panels.
  return (
    <div className="pad narrow">
      <SettingsHead
        title="Discovery"
        description={`${client?.name ?? "This client"} · ${filledCount} of ${KNOWLEDGE_SECTIONS.length} areas filled${
          filledCount < KNOWLEDGE_SECTIONS.length ? " — this is what determines how much the checks can do" : ""
        }`}
      />

      {isError && (
        <div className="empty">
          <b>Couldn&rsquo;t load the knowledge folder</b>
        </div>
      )}

      {!isError && !isLoading && (
        <div style={{ marginTop: 24 }}>
          {KNOWLEDGE_SECTIONS.map((section) => (
            <KnowledgeSection
              key={section.key}
              clientId={id}
              agencyId={agency?.agencyId}
              sectionKey={section.key}
              label={section.label}
              entries={entries?.filter((e) => e.section === section.key) ?? []}
              isStaff={confirmedStaff}
            />
          ))}
        </div>
      )}
    </div>
  );
}
