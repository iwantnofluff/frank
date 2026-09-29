"use client";

import { useCopyVersions } from "@/hooks/use-copy-versions";
import { CopyVersionHistoryPopover } from "@/components/project/CopyVersionHistoryPopover";
import type { CreativeListRow } from "@/hooks/use-creatives";

// The Feed Preview grid and the Share modal's own grid don't need
// CreativePreviewPopover's full card (stage, comments, placeholder art) —
// just the latest caption, in the same V{n} + text shape
// CopyVersionHistoryPopover already renders for the calendar table's
// Post Copy cell ("the caption hover on the table", per direct
// instruction). This just fetches that one creative's versions and hands
// the latest row to that same component, rather than the whole history.
export function FeedCaptionPopover({
  creative,
  anchorRect,
  onMouseEnter,
  onMouseLeave,
}: {
  creative: CreativeListRow;
  anchorRect: DOMRect;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}) {
  const { data: copyVersions } = useCopyVersions(creative.id);
  const latest = copyVersions?.[0];
  const caption = latest?.fields?.caption;
  const rows = caption ? [{ versionNo: latest!.version_no, text: caption }] : [];

  return (
    <CopyVersionHistoryPopover
      label="Caption"
      rows={rows}
      anchorRect={anchorRect}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    />
  );
}
