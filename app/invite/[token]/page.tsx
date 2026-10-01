"use client";

import { use, useEffect, useState, type SubmitEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAcceptInvite, useInvite } from "@/hooks/use-invite";
import { PhotoPicker } from "@/components/profile/PhotoPicker";
import {
  ProfileFields,
  normaliseProfile,
  profileProblem,
  type ProfileValues,
} from "@/components/profile/ProfileFields";
import { errorMessage } from "@/lib/errors";
import { initials } from "@/lib/initials";
import { MIN_PASSWORD_LENGTH } from "@/lib/invites/constants";
import { ROLE_LABELS } from "@/lib/roles";
import { uploadAvatar, validateAvatar } from "@/lib/upload-avatar";

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <div className="authcard">
      <div className="mark authmark">F</div>
      <h1 className="h1">{title}</h1>
      <p className="sub">{body}</p>
      <Link className="btn primary" href="/login" style={{ textAlign: "center" }}>
        Go to sign in
      </Link>
    </div>
  );
}

export default function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const router = useRouter();
  const { data: invite, isLoading, isError } = useInvite(token);
  const accept = useAcceptInvite(token);
  const [profile, setProfile] = useState<ProfileValues>({
    first_name: "",
    last_name: "",
    designation: "",
    bio: "",
  });
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  // The account exists and is signed in, but the photo didn't upload — say
  // so and let them carry on rather than pretend it worked.
  const [photoFailed, setPhotoFailed] = useState<string | null>(null);

  function choosePhoto(file: File | null) {
    if (preview) URL.revokeObjectURL(preview);
    setPhoto(file);
    setPreview(file ? URL.createObjectURL(file) : null);
  }

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  async function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (invite?.status !== "ok") return;
    setError(null);
    const tidy = normaliseProfile(profile);
    if (invite.needsPassword) {
      setProfile(tidy);
      const problem = profileProblem(tidy);
      if (problem) return setError(problem);
      if (password.length < MIN_PASSWORD_LENGTH) {
        return setError(`Use at least ${MIN_PASSWORD_LENGTH} characters for your password`);
      }
    }
    try {
      const result = await accept.mutateAsync(invite.needsPassword ? { ...tidy, password } : {});
      if (!result.needsPassword) {
        router.push("/login?redirect_to=/dashboard");
        return;
      }
      const { error: signInError } = await createClient().auth.signInWithPassword({
        email: result.email,
        password,
      });
      if (signInError) throw signInError;
      // Only possible now: storage needs a signed-in staff member.
      if (photo) {
        try {
          await uploadAvatar(result.agencyId, photo);
        } catch (uploadError) {
          setPhotoFailed(errorMessage(uploadError, "Your photo didn't upload"));
          return;
        }
      }
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(errorMessage(err, "Couldn't accept the invite"));
    }
  }

  let content: React.ReactNode = null;
  if (photoFailed) {
    content = (
      <div className="authcard">
        <div className="mark authmark">F</div>
        <h1 className="h1">You&rsquo;re in</h1>
        <p className="sub">
          Your account is ready, but your photo didn&rsquo;t upload ({photoFailed}). You can add it
          any time from Your Profile.
        </p>
        <button
          type="button"
          className="btn primary"
          onClick={() => {
            router.push("/dashboard");
            router.refresh();
          }}
        >
          Continue
        </button>
      </div>
    );
  } else if (isError || invite?.status === "not_found") {
    content = (
      <Notice
        title="This invite link isn't valid"
        body="Check you used the whole link from the email, or ask whoever invited you to send a new one."
      />
    );
  } else if (invite?.status === "expired") {
    content = (
      <Notice
        title="This invite has expired"
        body="Invite links last 48 hours. Ask whoever invited you to send a new one."
      />
    );
  } else if (invite?.status === "accepted") {
    content = <Notice title="You've already joined" body="This invite has been used. Sign in to continue." />;
  } else if (invite?.status === "ok") {
    content = (
      <form className="authcard" onSubmit={handleSubmit}>
        <div className="mark authmark">F</div>
        <h1 className="h1">Join {invite.agencyName} on Frank</h1>
        <p className="sub">
          You&rsquo;ve been invited as {ROLE_LABELS[invite.role]}.{" "}
          {invite.needsPassword
            ? "Tell your team who you are, then choose a password."
            : `You already have a Frank account as ${invite.email} — accept, then sign in as usual.`}
        </p>

        {invite.needsPassword && (
          <>
            <PhotoPicker
              initials={initials(`${profile.first_name} ${profile.last_name}`, invite.email)}
              photoUrl={preview}
              onPick={(file) => {
                const bad = validateAvatar(file);
                if (bad) return setError(bad);
                setError(null);
                choosePhoto(file);
              }}
              onRemove={() => choosePhoto(null)}
            />
            <label className="authfield">
              <span>Email</span>
              <input type="email" value={invite.email} readOnly disabled />
            </label>
            <ProfileFields values={profile} onChange={setProfile} variant="auth" />
            <label className="authfield">
              <span>Password</span>
              <input
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
          </>
        )}

        {error && <p className="autherr">{error}</p>}

        <button className="btn primary" type="submit" disabled={accept.isPending}>
          {accept.isPending ? "Joining…" : invite.needsPassword ? "Create account" : "Accept invite"}
        </button>
      </form>
    );
  }

  return <div className="authwrap">{isLoading ? null : content}</div>;
}
