"use client";

import { useMyAgency } from "@/hooks/use-my-agency";
import { AiModelSettings } from "@/components/settings/AiModelSettings";
import { SettingsHead } from "@/components/settings/SettingsHead";

export default function DraftingModelPage() {
  const { data: agency } = useMyAgency();
  return (
    <div className="pad narrow">
      <SettingsHead title="Drafting Model" description="The AI model that drafts copy and runs checks for your workspace." />
      <AiModelSettings agencyId={agency?.agencyId} />
    </div>
  );
}
