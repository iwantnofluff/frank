"use client";

import { useState } from "react";
import { InviteLinks } from "@/components/team/InviteLinks";
import { useChangeMemberType, useRevokeInvite } from "@/hooks/use-manage-member";
import { useResendInvite, type SentInvite } from "@/hooks/use-invite-member";
import type { ClientPerson } from "@/hooks/use-project-access";
import { errorMessage } from "@/lib/errors";

type Item = { label: string; onClick: () => void; tone?: "danger" };

// A User's or Client's options in a profile's People (phase49), for the
// Owners and Admins above them: switch them between User and Client of this
// client, and resend or remove a pending invite. Held by the People section,
// not each row, so a removed person's row going doesn't lose the outcome.
export function usePersonActions(agencyId: string, clientId: string) {
  const changeType = useChangeMemberType(agencyId);
  const resend = useResendInvite();
  const revoke = useRevokeInvite(agencyId);
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);
  const [sent, setSent] = useState<SentInvite | null>(null);
  const failed = (fallback: string) => (e: Error) => setNotice({ text: errorMessage(e, fallback), error: true });

  function itemsFor(person: ClientPerson): Item[] {
    const items: Item[] = [
      person.kind === "user"
        ? {
            label: "Make Client",
            onClick: () =>
              changeType.mutate(
                { membershipId: person.membershipId, type: "client", clientId },
                { onSuccess: () => setNotice({ text: `${person.name} is now a Client` }), onError: failed("Couldn't change them") },
              ),
          }
        : {
            label: "Make User",
            onClick: () =>
              changeType.mutate(
                { membershipId: person.membershipId, type: "user" },
                { onSuccess: () => setNotice({ text: `${person.name} is now a User` }), onError: failed("Couldn't change them") },
              ),
          },
    ];
    if (!person.accepted) {
      items.push(
        {
          label: "Resend Invite",
          onClick: () =>
            resend.mutate(
              { membershipId: person.membershipId, email: person.email, name: person.name },
              {
                onSuccess: (s) => {
                  setSent(s);
                  setNotice({ text: `Invite resent to ${person.email}` });
                },
                onError: failed("Couldn't resend the invite"),
              },
            ),
        },
        {
          label: "Remove Invite",
          tone: "danger",
          onClick: () =>
            revoke.mutate(person.membershipId, {
              onSuccess: () => setNotice({ text: `Invite to ${person.email} removed` }),
              onError: failed("Couldn't remove the invite"),
            }),
        },
      );
    }
    return items;
  }

  // What happened, and a resent invite's link to share.
  const outcome = (
    <>
      {notice &&
        (notice.error ? (
          <p className="autherr">{notice.text}</p>
        ) : (
          <p className="msection-d" role="status">
            {notice.text}
          </p>
        ))}
      {sent && <InviteLinks sent={[sent]} />}
    </>
  );

  return { itemsFor, outcome };
}
