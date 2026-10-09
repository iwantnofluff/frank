"use client";

import { useState } from "react";
import { InviteSentModal } from "@/components/team/InviteSentModal";
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

  // Switching between User and Client of this client; onDone once saved.
  function switchType(person: ClientPerson, to: ClientPerson["kind"], onDone?: () => void) {
    if (to === person.kind) return;
    setNotice(null);
    changeType.mutate(
      to === "client"
        ? { membershipId: person.membershipId, type: "client", clientId }
        : { membershipId: person.membershipId, type: "user" },
      { onSuccess: () => onDone?.(), onError: failed("Couldn't change them") },
    );
  }

  function itemsFor(person: ClientPerson): Item[] {
    const done = (kind: string) => () => setNotice({ text: `${person.name} is now a ${kind}` });
    return [
      person.kind === "user"
        ? { label: "Make Client", onClick: () => switchType(person, "client", done("Client")) }
        : { label: "Make User", onClick: () => switchType(person, "user", done("User")) },
      ...inviteItems(person),
    ];
  }

  // A pending invite's own: resend it, or take it back.
  function inviteItems(person: ClientPerson): Item[] {
    const items: Item[] = [];
    if (!person.accepted) {
      items.push(
        {
          label: "Resend Invite",
          onClick: () =>
            resend.mutate(
              { membershipId: person.membershipId, email: person.email, name: person.name },
              {
                onSuccess: (s) => {
                  setNotice(null);
                  setSent(s);
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

  // What happened; a resent invite's link opens in its own window.
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
      {sent && <InviteSentModal sent={sent} onClose={() => setSent(null)} />}
    </>
  );

  return { itemsFor, inviteItems, switchType, switching: changeType.isPending, outcome };
}
