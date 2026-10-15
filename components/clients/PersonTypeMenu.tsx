"use client";

import type { ClientPerson } from "@/hooks/use-project-access";
import { RoleMenu, type RoleMenuItem } from "@/components/ui/RoleMenu";

const LABEL: Record<ClientPerson["kind"], string> = { user: "User", client: "Client" };

// Someone's type on a client's People, as a dropdown on the tag itself
// (direct instruction, in place of the row's ⋮ menu): User or Client of
// this client, picked straight away, then a pending invite's own options.
export function PersonTypeMenu({
  person,
  onSwitch,
  extra,
  disabled,
}: {
  person: ClientPerson;
  onSwitch: (to: ClientPerson["kind"]) => void;
  extra: RoleMenuItem[];
  disabled?: boolean;
}) {
  return (
    <RoleMenu
      name={person.name}
      what="type"
      value={person.kind}
      current={LABEL[person.kind]}
      options={(["user", "client"] as const).map((k) => ({ value: k, label: LABEL[k] }))}
      onPick={onSwitch}
      extra={extra}
      disabled={disabled}
    />
  );
}
