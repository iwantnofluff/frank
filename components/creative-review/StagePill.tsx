import { stageColor, stageLabel } from "@/lib/stage-labels";

// A feed tile's stage, as the project table's Status pill and the Review
// page's stage switch show it (direct instruction): its number and name,
// solid in the stage's colour with white words. The same pill on the
// Review page's Feed Preview and a review link's Feed.
export function StagePill({ stage }: { stage: number }) {
  return (
    <span className="stagepill stg" style={{ background: stageColor(stage, null) }}>
      <span className="no">{stage}.</span>
      {stageLabel(stage, "scheduled")}
    </span>
  );
}
