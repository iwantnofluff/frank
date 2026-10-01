"use client";

import { useState } from "react";
import { useMyAgency } from "@/hooks/use-my-agency";
import { useAvatarUrls } from "@/hooks/use-avatar-urls";
import {
  useChangeAvatar,
  useMyProfile,
  useRemoveAvatar,
  useUpdateProfile,
  type MyProfile,
} from "@/hooks/use-my-profile";
import { PhotoPicker } from "@/components/profile/PhotoPicker";
import {
  ProfileFields,
  normaliseProfile,
  profileProblem,
  type ProfileValues,
} from "@/components/profile/ProfileFields";
import { errorMessage } from "@/lib/errors";
import { initials } from "@/lib/initials";
import { validateAvatar } from "@/lib/upload-avatar";

function toValues(p: MyProfile): ProfileValues {
  return {
    first_name: p.first_name ?? "",
    last_name: p.last_name ?? "",
    designation: p.designation ?? "",
    bio: p.bio ?? "",
  };
}

export default function ProfilePage() {
  const { data: profile, isLoading, isError } = useMyProfile();

  return (
    <div className="pad" style={{ maxWidth: 560 }}>
      <h1 className="h1">Your Profile</h1>
      <p className="sub">How you appear to your team and on your comments.</p>

      {isError && (
        <div className="empty">
          <b>Couldn&rsquo;t load your profile</b>
        </div>
      )}

      {!isLoading && profile && <ProfileForm profile={profile} />}
    </div>
  );
}

// Rendered only once the profile has loaded, so the form starts from it
// directly rather than copying it into state after the fact.
function ProfileForm({ profile }: { profile: MyProfile }) {
  const { data: agency } = useMyAgency();
  const { data: photos } = useAvatarUrls([profile.avatar_asset_id]);
  const update = useUpdateProfile();
  const changePhoto = useChangeAvatar(agency?.agencyId);
  const removePhoto = useRemoveAvatar();

  const [values, setValues] = useState<ProfileValues>(() => toValues(profile));
  const [problem, setProblem] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    const tidy = normaliseProfile(values);
    setValues(tidy);
    const p = profileProblem(tidy);
    setProblem(p);
    setSaved(false);
    if (p) return;
    const row = await update.mutateAsync(tidy);
    setValues(toValues(row));
    setSaved(true);
  }

  const photoError = changePhoto.error ?? removePhoto.error;
  const photoUrl = profile.avatar_asset_id ? (photos?.[profile.avatar_asset_id] ?? null) : null;

  return (
    <div className="panel" style={{ padding: 20, marginTop: 16 }}>
      <PhotoPicker
        initials={initials(profile.name, profile.email)}
        photoUrl={photoUrl}
        busy={changePhoto.isPending || removePhoto.isPending}
        onPick={(file) => {
          const bad = validateAvatar(file);
          if (bad) return setProblem(bad);
          setProblem(null);
          changePhoto.mutate(file);
        }}
        onRemove={() => removePhoto.mutate()}
      />
      {!!photoError && (
        <p className="autherr">{errorMessage(photoError, "Couldn't update your photo")}</p>
      )}

      <div className="field">
        <label htmlFor="pfEmail">Email</label>
        <input id="pfEmail" value={profile.email} readOnly disabled />
      </div>
      <ProfileFields
        values={values}
        onChange={(v) => {
          setValues(v);
          setSaved(false);
        }}
        variant="page"
      />

      {problem && <p className="autherr">{problem}</p>}
      {update.error && (
        <p className="autherr">{errorMessage(update.error, "Couldn't save your profile")}</p>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4 }}>
        <button
          type="button"
          className="btn primary"
          disabled={update.isPending}
          onClick={() => handleSave().catch(() => {})}
        >
          {update.isPending ? "Saving…" : "Save"}
        </button>
        {saved && (
          <span className="sub" role="status" style={{ margin: 0 }}>
            Saved
          </span>
        )}
      </div>
    </div>
  );
}
