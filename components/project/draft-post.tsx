"use client";

import { useState } from "react";
import { useCreateCreative } from "@/hooks/use-create-creative";
import { useMyAgency } from "@/hooks/use-my-agency";
import { useTeamMembers } from "@/hooks/use-team-members";
import { errorMessage } from "@/lib/errors";
import { FORMAT_CATEGORIES, formatsByCategory } from "@/lib/formats";

// The prototype's "Row" way of adding a brief (#briefMore → startDraft()):
// a draft row at the top of the table, saved from the floating .editbar.
// Creates the post through the same useCreateCreative call, with the same
// required fields, as the New Post window — this is only a quicker form.

export interface DraftPostValues {
  name: string;
  format: string;
  leadUserId: string;
  date: string; // scheduled: publish date; continuous: due date (optional)
  time: string;
  destination: string; // continuous only
  concept: string;
}

const DEFAULT_FORMAT = formatsByCategory(FORMAT_CATEGORIES[0])[0]?.id ?? "";

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function useDraftPost({
  projectId,
  delivery,
  onCreated,
}: {
  projectId: string;
  delivery: "scheduled" | "continuous";
  onCreated: (focusDate: string | null) => void;
}) {
  const createCreative = useCreateCreative(projectId);
  const { data: agency } = useMyAgency();
  const { data: team } = useTeamMembers(agency?.agencyId);
  const [values, setValues] = useState<DraftPostValues>({
    name: "",
    format: DEFAULT_FORMAT,
    leadUserId: "",
    // Today for both: an Other Content post with no due date is never listed
    // in its table, so one added by row would vanish on save.
    date: todayIso(),
    time: "09:00",
    destination: "",
    concept: "",
  });
  const [problem, setProblem] = useState<string | null>(null);

  function set<K extends keyof DraftPostValues>(key: K, value: DraftPostValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
    setProblem(null);
  }

  async function save() {
    // Same checks, in the same order, as the window's handleSaveBrief.
    if (!values.name.trim()) return setProblem("Give the post a name");
    if (delivery === "scheduled" && !values.date) return setProblem("Pick a publish date");
    if (delivery === "continuous" && !values.destination.trim()) return setProblem("Say where this goes");
    const scheduledAt =
      delivery === "scheduled" ? new Date(`${values.date}T${values.time || "09:00"}:00`).toISOString() : null;
    try {
      await createCreative.mutateAsync({
        name: values.name.trim(),
        formats: [values.format],
        leadUserId: values.leadUserId || null,
        concept: values.concept,
        referenceUrl: "",
        slideText: [],
        cx: {},
        scheduledAt,
        destination: delivery === "continuous" ? values.destination.trim() : null,
        dueOn: delivery === "continuous" ? values.date || null : null,
      });
      onCreated(scheduledAt ?? (values.date || null));
    } catch (e) {
      setProblem(errorMessage(e, "Couldn't add the post"));
    }
  }

  return {
    values,
    set,
    save,
    saving: createCreative.isPending,
    problem,
    team: (team ?? []).filter((m) => m.accepted_at && !m.removed_at),
  };
}

// The prototype's .editbar: fixed bottom-right, naming what's being added.
export function DraftEditBar({
  label,
  blocked,
  problem,
  saving,
  onCancel,
  onSave,
}: {
  label: string;
  // A required column is hidden, so the row has nowhere to type it.
  blocked: string | null;
  problem: string | null;
  saving: boolean;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <div className="editbar on" role="region" aria-label="New post row">
      <span className="eb-t">{blocked ?? problem ?? label}</span>
      <button type="button" className="btn sm" onClick={onCancel}>
        Cancel
      </button>
      <button type="button" className="btn sm primary" disabled={!!blocked || saving} onClick={onSave}>
        {saving ? "Saving…" : "Save"}
      </button>
    </div>
  );
}

type Draft = ReturnType<typeof useDraftPost>;

// One editable cell of the draft row, by what it holds. Each table maps its
// own column keys onto these.
export function DraftField({
  draft,
  field,
}: {
  draft: Draft;
  field: "name" | "format" | "lead" | "date" | "time" | "destination" | "concept";
}) {
  const { values, set } = draft;
  switch (field) {
    case "name":
      return (
        <input
          className="ecell one"
          aria-label="Post name"
          autoFocus
          placeholder="Name this post"
          value={values.name}
          onChange={(e) => set("name", e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") draft.save();
          }}
        />
      );
    case "format":
      return (
        <select className="ecell one" aria-label="Post type" value={values.format} onChange={(e) => set("format", e.target.value)}>
          {FORMAT_CATEGORIES.map((cat) => (
            <optgroup key={cat} label={cat}>
              {formatsByCategory(cat).map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      );
    case "lead":
      return (
        <select className="ecell one" aria-label="Lead" value={values.leadUserId} onChange={(e) => set("leadUserId", e.target.value)}>
          <option value="">No lead yet</option>
          {draft.team.map((m) => (
            <option key={m.user_id} value={m.user_id}>
              {m.user?.name ?? m.user?.email}
            </option>
          ))}
        </select>
      );
    case "date":
      return (
        <input
          type="date"
          className="ecell one"
          aria-label="Date"
          value={values.date}
          onChange={(e) => set("date", e.target.value)}
        />
      );
    case "time":
      return (
        <input
          type="time"
          className="ecell one"
          aria-label="Time"
          value={values.time}
          onChange={(e) => set("time", e.target.value)}
        />
      );
    case "destination":
      return (
        <input
          className="ecell one"
          aria-label="Destination"
          placeholder="Where this goes"
          value={values.destination}
          onChange={(e) => set("destination", e.target.value)}
        />
      );
    case "concept":
      return (
        <textarea
          className="ecell"
          aria-label="Concept"
          rows={3}
          placeholder="What is being made"
          value={values.concept}
          onChange={(e) => set("concept", e.target.value)}
        />
      );
  }
}
