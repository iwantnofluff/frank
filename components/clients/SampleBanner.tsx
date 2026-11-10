"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useClientDetail } from "@/hooks/use-client";
import { useMyAgency } from "@/hooks/use-my-agency";
import { useMyMembership } from "@/hooks/use-my-membership";
import { useRemoveSample } from "@/hooks/use-sample";
import { seesAllClients } from "@/lib/roles";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

const DAY = 86_400_000;

// When the sample is removed, in words.
function removedIn(expiresAt: string | null): string {
  if (!expiresAt) return "in 7 days";
  const days = Math.ceil((new Date(expiresAt).getTime() - Date.now()) / DAY);
  if (days <= 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
}

// The sample client's banner (phase145, direct instruction): on its pages,
// what it is, when it goes, and Remove now for Owners and Admins.
export function SampleBanner({ clientId }: { clientId: string | null | undefined }) {
  const router = useRouter();
  const { data: client } = useClientDetail(clientId ?? "");
  const { data: agency } = useMyAgency();
  const { data: membership } = useMyMembership(agency?.agencyId);
  const remove = useRemoveSample();
  const [confirming, setConfirming] = useState(false);
  if (!clientId || !client?.is_sample) return null;
  const canRemove = !membership?.client_id && seesAllClients(membership?.role);

  return (
    <div className="samplebar" role="note">
      <span className="tag amber">Sample</span>
      <span className="samplebar-t">
        {client.name} is a made-up client to explore Frank with. It&rsquo;s removed {removedIn(client.sample_expires_at)}, with
        everything in it, and doesn&rsquo;t count towards your plan.
      </span>
      {canRemove && (
        <button type="button" className="btn sm" onClick={() => setConfirming(true)}>
          Remove Now
        </button>
      )}
      {confirming && (
        <ConfirmDialog
          title="Remove the sample client"
          message={`this removes ${client.name}, its project, posts, comments and files for good.`}
          confirmLabel="Remove"
          pendingLabel="Removing…"
          isPending={remove.isPending}
          error={remove.error}
          errorFallback="Couldn't remove the sample client"
          onClose={() => setConfirming(false)}
          onConfirm={() =>
            remove.mutate(client.id, {
              onSuccess: () => {
                setConfirming(false);
                router.push("/dashboard");
              },
            })
          }
        />
      )}
    </div>
  );
}
