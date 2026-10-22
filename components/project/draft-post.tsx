"use client";

import { useState } from "react";
import { useCreateCreative } from "@/hooks/use-create-creative";
import { useMyAgency } from "@/hooks/use-my-agency";
import { useTeamMembers } from "@/hooks/use-team-members";
import { useProjectTeam } from "@/hooks/use-project-team";
import { TeamPicker } from "@/components/ui/TeamPicker";
import { DateField, TimeField } from "@/components/ui/DateField";
import { errorMessage } from "@/lib/errors";
import { COPY_FIELD_LABELS, FORMAT_CATEGORIES, copyFieldsFor, formatsByCategory, frameLimits, hasVideoFormat } from "@/lib/formats";
import { IDEA, stageColor, stageLabel } from "@/lib/stage-labels";

// The prototype's "Row" way of adding a brief (#briefMore → startDraft()):
// a draft row at the top of the table, saved from the floating .editbar.
// Creates the post through the same useCreateCreative call, with the same
// required fields, as the New Post window — this is only a quicker form.

export interface DraftPostValues {
  name: string;
  format: string;
  teamUserIds: string[];
  date: string; // scheduled: publish date; continuous: due date (optional)
  time: string;
  concept: string;
  // Typed straight into the row too (direct instruction): its slides, a
  // video's VO, Text on Image (one slide only), and its main copy field
  // and Alt Text.
  slideCount: number | null;
  voiceover: string;
  textOnImage: string;
  caption: string;
  alt: string;
  designerNotes: string;
  principles: string;
}

// The copy field the row's Caption box fills: the format's main one (a
// caption, an ad's primary text…), or a caption with no format yet.
export function mainCopyField(format: string): string {
  return copyFieldsFor(format ? [format] : []).find((k) => k !== "alt") ?? "caption";
}

// None to start, as in the New Post window: a format can wait (phase114).
const DEFAULT_FORMAT = "";

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
  // Only the project's own team (direct instruction).
  const { data: projectTeam } = useProjectTeam(projectId);
  const [values, setValues] = useState<DraftPostValues>({
    name: "",
    format: DEFAULT_FORMAT,
    teamUserIds: [],
    // Today for both: an Other Content post with no due date is never listed
    // in its table, so one added by row would vanish on save.
    date: todayIso(),
    time: "09:00",
    concept: "",
    slideCount: null,
    voiceover: "",
    textOnImage: "",
    caption: "",
    alt: "",
    designerNotes: "",
    principles: "",
  });
  const [problem, setProblem] = useState<string | null>(null);

  function set<K extends keyof DraftPostValues>(key: K, value: DraftPostValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
    setProblem(null);
  }

  async function save() {
    // Same checks, in the same order, as the window's handleSaveBrief.
    if (!values.name.trim()) return setProblem("Give the post a name");
    const scheduledAt =
      delivery === "scheduled" && values.date ? new Date(`${values.date}T${values.time || "09:00"}:00`).toISOString() : null;
    const formats = values.format ? [values.format] : [];
    const frames = frameLimits(formats);
    const slideCount = frames ? Math.min(Math.max(values.slideCount ?? frames.min, frames.min), frames.max) : null;
    const takesAlt = !values.format || copyFieldsFor(formats).includes("alt");
    try {
      await createCreative.mutateAsync({
        name: values.name.trim(),
        formats,
        teamUserIds: values.teamUserIds,
        concept: values.concept,
        referenceUrls: [],
        slideCount,
        cx: delivery === "continuous" && values.principles.trim() ? { principles: values.principles.trim() } : {},
        designerNotes: values.designerNotes,
        voiceover: hasVideoFormat(formats) ? values.voiceover : "",
        // One slide's words; a post of several adds them in its window.
        slideText: (slideCount ?? 1) > 1 ? [] : [values.textOnImage],
        copyFields: { [mainCopyField(values.format)]: values.caption, ...(takesAlt ? { alt: values.alt } : {}) },
        scheduledAt,
        // No longer asked for (direct instruction).
        destination: null,
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
    delivery,
    team: (team ?? []).filter((m) => m.accepted_at && !m.removed_at && !!projectTeam?.includes(m.user_id)),
  };
}

// The bar above the table while a row is being added (direct instruction):
// the selection bar's look, "1 added" with Cancel and Save on the right,
// in place of the prototype's .editbar fixed at the bottom right.
export function DraftEditBar({
  blocked,
  problem,
  saving,
  onCancel,
  onSave,
}: {
  // A required column is hidden, so the row has nowhere to type it.
  blocked: string | null;
  problem: string | null;
  saving: boolean;
  onCancel: () => void;
  onSave: () => void;
}) {
  const note = blocked ?? problem;
  return (
    <div className="selectionbar" role="region" aria-label="New post row">
      <span>1 added</span>
      {note && <span className="sb-note">{note}</span>}
      <div style={{ flex: 1 }} />
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
export type DraftFieldKey = "name" | "format" | "lead" | "date" | "time" | "concept" | "status" | "slides" | "voiceover" | "imageOnText" | "caption" | "alt" | "notes" | "principles";

// One editable cell of the draft row, by what it holds. Each table maps its
// own column keys onto these.
export function DraftField({
  draft,
  field,
}: {
  draft: Draft;
  field: DraftFieldKey;
}) {
  const { values, set } = draft;
  const formats = values.format ? [values.format] : [];
  const frames = frameLimits(formats);
  const slides = frames ? Math.min(Math.max(values.slideCount ?? frames.min, frames.min), frames.max) : null;
  switch (field) {
    case "status": {
      // The pill it'll get (direct instruction): an Idea with no date;
      // else, as the database will place it, Internal Review with copy
      // (a copy version moves it there), In Production with a Concept or
      // other words, else Concept.
      if (!values.date) {
        return (
          <span className="stg idea">
            <span className="no">0.</span>
            {IDEA.label}
          </span>
        );
      }
      const hasCopy = [values.caption, values.alt].some((t) => t.trim());
      const written = [values.concept, values.textOnImage, values.voiceover].some((t) => t.trim());
      const stage = hasCopy ? 3 : written ? 2 : 1;
      return (
        <span className="stg" style={{ background: stageColor(stage, null) }}>
          <span className="no">{stage}.</span>
          {stageLabel(stage, draft.delivery)}
        </span>
      );
    }
    case "slides":
      return frames ? (
        <select
          className="ecell one"
          aria-label={frames.noun === "Story" ? "Stories" : "Slides"}
          value={slides ?? frames.min}
          onChange={(e) => set("slideCount", Number(e.target.value))}
        >
          {Array.from({ length: frames.max - frames.min + 1 }, (_, i) => frames.min + i).map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      ) : (
        <span className="tdim">—</span>
      );
    case "voiceover":
      return hasVideoFormat(formats) ? (
        <textarea className="ecell" aria-label="VO" rows={3} placeholder="The voiceover" value={values.voiceover} onChange={(e) => set("voiceover", e.target.value)} />
      ) : (
        <span className="tdim">—</span>
      );
    case "imageOnText":
      // Several slides each have their own, added in the post's window.
      return (slides ?? 1) > 1 ? (
        <span className="tdim">In the post, by {frames?.noun.toLowerCase() ?? "slide"}</span>
      ) : (
        <textarea className="ecell" aria-label="Text on Image" rows={3} placeholder="The words on the artwork" value={values.textOnImage} onChange={(e) => set("textOnImage", e.target.value)} />
      );
    case "caption": {
      const label = COPY_FIELD_LABELS[mainCopyField(values.format)] ?? "Caption";
      return (
        <textarea className="ecell" aria-label={label} rows={3} placeholder={label} value={values.caption} onChange={(e) => set("caption", e.target.value)} />
      );
    }
    case "notes":
      return (
        <textarea
          className="ecell"
          aria-label="Notes for Designer"
          rows={3}
          placeholder="What the designer should know"
          value={values.designerNotes}
          onChange={(e) => set("designerNotes", e.target.value)}
        />
      );
    case "principles":
      return (
        <input className="ecell one" aria-label="Principles" placeholder="The psychological angle" value={values.principles} onChange={(e) => set("principles", e.target.value)} />
      );
    case "alt":
      return !values.format || copyFieldsFor(formats).includes("alt") ? (
        <textarea className="ecell" aria-label="Alt Text" rows={3} placeholder="For screen readers" value={values.alt} onChange={(e) => set("alt", e.target.value)} />
      ) : (
        <span className="tdim">—</span>
      );
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
          <option value="">No format yet</option>
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
        <TeamPicker
          compact
          options={draft.team.map((m) => ({ id: m.user_id, name: m.user?.name ?? m.user?.email ?? "—" }))}
          value={values.teamUserIds}
          onChange={(ids) => set("teamUserIds", ids)}
        />
      );
    case "date":
      return (
        // Frank's own dropdown, opened from anywhere in the box.
        <DateField className="ecell one when" aria-label="Date" value={values.date} onChange={(v) => set("date", v)} />
      );
    case "time":
      return (
        // Frank's own dropdown, opened from anywhere in the box.
        <TimeField className="ecell one when" aria-label="Time" value={values.time} onChange={(v) => set("time", v)} />
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
