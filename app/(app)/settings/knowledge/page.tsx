"use client";

import { useMyAgency } from "@/hooks/use-my-agency";
import { useFormatDirections } from "@/hooks/use-format-directions";
import { FormatDirectionCard } from "@/components/settings/FormatDirectionCard";
import { AddFormatForm } from "@/components/settings/AddFormatForm";

export default function FormatDirectionsPage() {
  const { data: agency } = useMyAgency();
  const {
    data: formats,
    isLoading,
    isError,
  } = useFormatDirections(agency?.agencyId);

  return (
    <div className="pad narrow">
      <h1 className="h1">Format directions</h1>
      <p className="sub">
        What each format needs from the copy, and the numbers the drafter
        builds to. Shared across every client at {agency?.name ?? "this agency"}.
      </p>

      {isError && (
        <div className="empty">
          <b>Couldn&rsquo;t load format directions</b>
        </div>
      )}

      {!isError && !isLoading && formats?.length === 0 && (
        <div className="empty">
          <b>No formats defined yet</b>
          <span>Add the first one below.</span>
        </div>
      )}

      {!isError && agency && formats && formats.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 14 }}>
          {formats.map((record, i) => (
            <FormatDirectionCard
              key={record.id}
              agencyId={agency.agencyId}
              record={record}
              defaultOpen={i === 0}
            />
          ))}
        </div>
      )}

      {agency && <AddFormatForm agencyId={agency.agencyId} />}
    </div>
  );
}
