"use client";

import { PersonAvatar } from "@/components/ui/PersonAvatar";
import { useAvatarUrls } from "@/hooks/use-avatar-urls";
import { avatarColour } from "@/lib/avatar-colour";
import { initials } from "@/lib/initials";
import type { PresentPerson } from "@/hooks/use-project-presence";

// Who else is here (direct instruction, phase82): their pictures, a few
// then "+2", each saying on hover who and what they're doing. A dot on
// anyone editing.
export function PresenceAvatars({ people, describe }: { people: PresentPerson[]; describe: (p: PresentPerson) => string }) {
  const { data: photos } = useAvatarUrls(people.map((p) => p.avatarAssetId));
  if (!people.length) return null;
  const shown = people.slice(0, 4);
  const more = people.length - shown.length;
  return (
    <div className="presence" aria-label={`Also here: ${people.map(describe).join(", ")}`}>
      {shown.map((p) => (
        <span key={p.userId} className={`presence-p${p.editing ? " editing" : ""}`} title={describe(p)}>
          <PersonAvatar
            className="presence-av"
            style={{ background: avatarColour(p.name) }}
            initials={initials(p.name, "?")}
            photoUrl={p.avatarAssetId ? photos?.[p.avatarAssetId] : null}
            hasPhoto={!!p.avatarAssetId}
          />
        </span>
      ))}
      {more > 0 && <span className="presence-more">+{more}</span>}
    </div>
  );
}
