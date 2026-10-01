"use client";

import { titleCase } from "@/lib/title-case";

import { BIO_MAX } from "@/lib/invites/constants";

export { BIO_MAX };

export interface ProfileValues {
  first_name: string;
  last_name: string;
  designation: string;
  bio: string;
}

export function profileProblem(v: ProfileValues): string | null {
  if (!v.first_name.trim()) return "Enter your first name";
  if (!v.last_name.trim()) return "Enter your last name";
  if (!v.designation.trim()) return "Enter your designation";
  if (v.bio.length > BIO_MAX) return `Keep your bio under ${BIO_MAX} characters`;
  return null;
}

// The database title-cases names and designation whatever is sent
// (users_normalise_profile); doing it here on blur just shows people the
// result before they submit, rather than surprising them afterwards.
export function normaliseProfile(v: ProfileValues): ProfileValues {
  return {
    first_name: titleCase(v.first_name),
    last_name: titleCase(v.last_name),
    designation: titleCase(v.designation),
    bio: v.bio.trim(),
  };
}

export function ProfileFields({
  values,
  onChange,
  variant,
}: {
  values: ProfileValues;
  onChange: (v: ProfileValues) => void;
  // The accept page sits in the narrow .authcard and uses its .authfield
  // labels; Your Profile is a normal page and uses .field.
  variant: "auth" | "page";
}) {
  const set = (key: keyof ProfileValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    onChange({ ...values, [key]: e.target.value });
  const tidy = (key: "first_name" | "last_name" | "designation") => () =>
    onChange({ ...values, [key]: titleCase(values[key]) });

  const Wrap = ({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) =>
    variant === "auth" ? (
      <label className="authfield">
        <span>{label}</span>
        {children}
      </label>
    ) : (
      <div className="field">
        <label htmlFor={htmlFor}>{label}</label>
        {children}
      </div>
    );

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {Wrap({
          label: "First name",
          htmlFor: "pfFirst",
          children: (
            <input
              id="pfFirst"
              autoComplete="given-name"
              value={values.first_name}
              onChange={set("first_name")}
              onBlur={tidy("first_name")}
            />
          ),
        })}
        {Wrap({
          label: "Last name",
          htmlFor: "pfLast",
          children: (
            <input
              id="pfLast"
              autoComplete="family-name"
              value={values.last_name}
              onChange={set("last_name")}
              onBlur={tidy("last_name")}
            />
          ),
        })}
      </div>
      {Wrap({
        label: "Designation",
        htmlFor: "pfDesignation",
        children: (
          <input
            id="pfDesignation"
            autoComplete="organization-title"
            placeholder="e.g. Senior Designer"
            value={values.designation}
            onChange={set("designation")}
            onBlur={tidy("designation")}
          />
        ),
      })}
      {Wrap({
        label: `Short bio (optional, ${values.bio.length}/${BIO_MAX})`,
        htmlFor: "pfBio",
        children: (
          <textarea
            id="pfBio"
            rows={3}
            maxLength={BIO_MAX}
            value={values.bio}
            onChange={set("bio")}
          />
        ),
      })}
    </>
  );
}
