// A feed tile's stage, named and coloured as the Review page's stage switch
// names and colours them (direct instruction): Internal Review (Concept
// counts as it there too), Client Review, Approved. The same pill on the
// Review page's Feed Preview and a review link's Feed.
export function StagePill({ stage }: { stage: number }) {
  const [label, tone] =
    stage >= 4 ? ["Approved", "approved"] : stage === 3 ? ["Client Review", "client"] : ["Internal Review", "internal"];
  return <span className={`stagepill ${tone}`}>{label}</span>;
}
