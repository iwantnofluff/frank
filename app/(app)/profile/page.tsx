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
import { useIsStaff } from "@/hooks/use-is-staff";
import { useMyTips, useSetTipsEvery } from "@/hooks/use-tips";
import { TIP_EVERY_OPTIONS } from "@/lib/tips";

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
      <NotificationSettings />
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

// Your own Notifications settings (direct instruction): how often a tip
// shows (phase116), once a day by default. The team only, as tips are.
function NotificationSettings() {
  const { isStaff, isPending } = useIsStaff();
  const enabled = isStaff && !isPending;
  const { data: tips, error } = useMyTips(enabled);
  const setEvery = useSetTipsEvery();
  if (!enabled) return null;
  return (
    <section className="panel" id="notifications" style={{ marginTop: 16 }}>
      <div className="panel-h">
        <b>Notifications</b>
        {setEvery.isSuccess && !setEvery.isPending && <span className="sync">Saved</span>}
      </div>
      {error && <p className="autherr">{errorMessage(error, "Couldn't load your notification settings")}</p>}
      {tips && (
        <div className="srow">
          <span className="sl">
            <b>Show tips</b>
            <span>A tip about something in Frank, top right for 5 seconds. Once a day is the first time you open Frank that day.</span>
          </span>
          <select
            aria-label="Show tips"
            value={tips.everyHours}
            disabled={setEvery.isPending}
            onChange={(e) => setEvery.mutate(Number(e.target.value))}
          >
            {TIP_EVERY_OPTIONS.map((o) => (
              <option key={o.hours} value={o.hours}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      )}
      {setEvery.error && <p className="autherr">{errorMessage(setEvery.error, "Couldn't save that change")}</p>}
    </section>
  );
}
