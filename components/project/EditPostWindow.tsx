"use client";

import { CreativeModal, type FocusTarget } from "@/components/creative-review/CreativeModal";
import { useCreative } from "@/hooks/use-creative";
import { useCreativeVersions } from "@/hooks/use-creative-versions";
import { useCopyVersions } from "@/hooks/use-copy-versions";

// A post's Edit window, opened from a project table's Pending cell (direct
// instruction) without leaving the table: the post and its versions loaded
// here, as its own page loads them, and the cursor in the field it's for.
export function EditPostWindow({
  creativeId,
  focus,
  onClose,
}: {
  creativeId: string;
  focus: FocusTarget;
  onClose: () => void;
}) {
  const { data: creative } = useCreative(creativeId);
  const { data: creativeVersions } = useCreativeVersions(creativeId);
  const { data: copyVersions } = useCopyVersions(creativeId);
  if (!creative || !creativeVersions || !copyVersions) return null;
  return (
    <CreativeModal
      mode="edit"
      creative={creative}
      creativeVersions={creativeVersions}
      copyVersions={copyVersions}
      initialFocus={focus}
      onClose={onClose}
      // Its own page shows the new version; here the table's cells follow
      // the saved versions by themselves.
      onCreativeVersionCreated={() => {}}
      onCopyVersionCreated={() => {}}
    />
  );
}
