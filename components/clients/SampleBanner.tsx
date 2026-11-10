"use client";

import { useClientDetail } from "@/hooks/use-client";
import { useMyAgency } from "@/hooks/use-my-agency";
import { useMyMembership } from "@/hooks/use-my-membership";
import { isSampleKept, useHideSample } from "@/hooks/use-sample";
import { seesAllClients } from "@/lib/roles";
import { errorMessage } from "@/lib/errors";

const DAY = 86_400_000;

// When the sample is hidden, in words.
function hiddenIn(expiresAt: string | null): string {
  if (!expiresAt) return "in 7 days";
  const days = Math.ceil((new Date(expiresAt).getTime() - Date.now()) / DAY);
  if (days <= 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
}

// The sample client's banner (phase145/146, direct instruction): on its
// pages, what it is and when it's hidden from your lists (never deleted:
// Frank Tour and Show Me use it), with Hide Now, or Show It once hidden,
// for Owners and Admins.
export function SampleBanner({ clientId }: { clientId: string | null | undefined }) {
  const { data: client } = useClientDetail(clientId ?? "");
  const { data: agency } = useMyAgency();
  const { data: membership } = useMyMembership(agency?.agencyId);
  const hide = useHideSample();
  if (!clientId || !client?.is_sample) return null;
  const canChange = !membership?.client_id && seesAllClients(membership?.role);
  const hidden = !!client.archived_at;

  return (
    <div className="samplebar" role="note">
      <span className="tag amber">Sample</span>
      <span className="samplebar-t">
        {hidden ? (
          <>{client.name} is hidden from your lists. It&rsquo;s shown here for Frank Tour and Help&rsquo;s Show Me.</>
        ) : (
          <>
            {client.name} is a made-up client to explore Frank with.{" "}
            {isSampleKept(client.sample_expires_at)
              ? "It’s kept in your lists,"
              : `It’s hidden from your lists ${hiddenIn(client.sample_expires_at)},`}{" "}
            and doesn&rsquo;t count towards your plan.
          </>
        )}
        {hide.error && <span className="autherr"> {errorMessage(hide.error, "Couldn't change the sample client")}</span>}
      </span>
      {canChange && (
        <button
          type="button"
          className="btn sm"
          disabled={hide.isPending}
          onClick={() => hide.mutate({ clientId: client.id, hide: !hidden })}
        >
          {hidden ? "Show It" : "Hide Now"}
        </button>
      )}
    </div>
  );
}
