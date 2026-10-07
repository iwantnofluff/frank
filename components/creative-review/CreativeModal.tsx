"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DateTimePicker } from "@/components/ui/DateTimePicker";
import { CxCell } from "@/components/project/CxCell";
import type { CreativeRow } from "@/hooks/use-creative";
import { useCopyVersions, type CopyVersionRow } from "@/hooks/use-copy-versions";
import { useCreativeVersions, versionSlides, type CreativeVersionRow } from "@/hooks/use-creative-versions";
import { useCreateCreative } from "@/hooks/use-create-creative";
import { useSaveSlideText } from "@/hooks/use-save-slide-text";
import { useUpdateCreativeCx } from "@/hooks/use-update-creative-cx";
import { FUNNEL_COLUMN } from "@/components/project/ContinuousCalendarTable";
import { useUpdateBrief } from "@/hooks/use-update-brief";
import { useTeamMembers } from "@/hooks/use-team-members";
import { useMyAgency } from "@/hooks/use-my-agency";
import { useCustomColumns } from "@/hooks/use-custom-columns";
import {
  useUploadCarouselVersion,
  type SlideSource,
  type UploadProgress,
} from "@/hooks/use-upload-creative-version";
import { UploadProgressBar } from "./UploadProgressBar";
import { CarouselSlots } from "./CarouselSlots";
import { useSaveCopyFields } from "@/hooks/use-save-copy-fields";
import { useRefreshWiifmNote } from "@/hooks/use-refresh-wiifm-note";
import { CopyChat } from "@/components/creative-review/CopyChat";
import { useDeletePostVersion } from "@/hooks/use-delete-post-version";
import { useClearArtwork } from "@/hooks/use-clear-artwork";
import { artworkChangeReasons } from "@/lib/format-change";
import { useComments } from "@/hooks/use-comments";
import { useAgencyAiSettings } from "@/hooks/use-agency-ai-settings";
import { useAgencyKnowledge } from "@/hooks/use-agency-knowledge";
import { useKnowledgeEntries } from "@/hooks/use-knowledge-entries";
import { useRepeatIssueCount } from "@/hooks/use-repeat-issues";
import {
  FORMAT_CATEGORIES,
  formatsByCategory,
  formatsLabel,
  copyFieldsFor,
  postFormats,
  carouselMaxSlides,
  aspectRatioCss,
  CAROUSEL_MIN_SLIDES,
  COPY_FIELD_LABELS,
} from "@/lib/formats";
import { slideFields, tidySlideText } from "@/lib/slide-text";
import { ListEditor } from "@/components/ui/ListEditor";
import { linkHref, tidyReferences } from "@/lib/links";
import { FormatPicker } from "./FormatPicker";
import {
  applySlideDraft,
  isSlideField,
  slideTextAsFields,
  slideTextFields,
  type CopyChatField as CopyFieldSpec,
} from "@/lib/ai/copy-chat";
import { buildCheckPrompt, parseCheckFindings, type CheckFinding } from "@/lib/ai/build-check-prompt";
import { KNOWLEDGE_SECTIONS } from "@/lib/knowledge-sections";
import { modelById } from "@/lib/ai/models";
import { errorMessage } from "@/lib/errors";

const KNOWLEDGE_SECTION_LABELS: Record<string, string> = Object.fromEntries(
  KNOWLEDGE_SECTIONS.map((s) => [s.key, s.label]),
);

type Tab = "brief" | "upload" | "checks";

// Long-form fields get a textarea, short ones a single-line input — same
// split the prototype's own capField rendering makes (frank-prototype.html).
const LONG_COPY_FIELDS = new Set(["caption", "description", "body", "notes", "primary"]);

// Saving used to insert a new copy_versions row unconditionally, even when
// nothing about the fields had actually changed (e.g. opening the modal and
// pressing Save without touching Copy at all). Compared against the merge
// handleSaveUpload actually sends (existing fields + draft fields), not
// draftFields alone — a field this format doesn't use, or one carried over
// unedited from the latest version, must not register as a "change".
function fieldsEqual(a: Record<string, string>, b: Record<string, string>): boolean {
  const aKeys = Object.keys(a).sort();
  const bKeys = Object.keys(b).sort();
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((key, i) => key === bKeys[i] && a[key] === b[key]);
}

// Replaces three separate entry points (New Brief, Upload or Edit, Draft
// from Brief) with one window: a Brief tab (what's being made and why —
// never the caption) and a Content tab (the artwork, the caption
// fields, Draft from Brief, and the three checks). A deliberate, conscious
// reversal of this app's own documented "briefing and upload are different
// moments" decision (project-details/frank-developer-handover.docx) — the
// doc itself says changing a decision is fine, only doing it unknowingly
// isn't, so this comment is that record.
type CreativeModalProps =
  | {
      mode: "create";
      projectId: string;
      clientId: string;
      delivery: "scheduled" | "continuous";
      onCreated?: (scheduledAt: string | null, dueOn: string | null) => void;
      onClose: () => void;
    }
  | {
      mode: "edit";
      creative: CreativeRow;
      // Full history, newest first (useCreativeVersions/useCopyVersions'
      // own order) — not just the latest. Version tabs need to browse it.
      creativeVersions: CreativeVersionRow[];
      copyVersions: CopyVersionRow[];
      initialTab?: Tab;
      onCreativeVersionCreated: (versionId: string) => void;
      onCopyVersionCreated: (versionId: string) => void;
      onClose: () => void;
    };

type CheckKind = "brand" | "wiifm" | "creative";

const CHECK_LABELS: Record<CheckKind, string> = {
  wiifm: "Check WIIFM",
  creative: "Check Creative",
  brand: "Check Brand",
};

// Each check is now its own section on the Checks tab (same footing as
// Creative/Copy on the Content tab) — this is what sits under its
// .msection-h, describing what the section checks for, not what's
// currently in it.
const CHECK_SECTION_DESCRIPTIONS: Record<CheckKind, string> = {
  wiifm:
    "Whether this copy leads with a real reader benefit, and draws on the agency's own reference material.",
  brand: "Whether this copy fits this client's brand knowledge — tone, protected terms, and anything else documented for them.",
  creative: "Protected terms, line lengths and the format spec, checked against the artwork itself.",
};

// "Check Creative" isn't part of this pass — it'd check the artwork itself
// (protected terms in on-image text, line lengths, the format spec), which
// needs OCR/vision on the actual asset, not just a text prompt. Left as
// the same placeholder it always was.
const MOCK_CREATIVE_CHECK = {
  against: "protected terms, line lengths and the format spec — not the image itself",
  findings: [
    {
      tone: "ok" as const,
      title: "Mock finding — protected terms",
      body: "No protected term collisions found in the on-artwork text.",
    },
    {
      tone: "warn" as const,
      title: "Mock finding — line length",
      body: "Line 2 runs to nine words; the format spec asks for six or fewer.",
    },
  ],
};

function FindingsList({ findings }: { findings: { tone: "ok" | "warn"; title: string; body: string }[] }) {
  return (
    <>
      {findings.map((f, i) => (
        <div className={`checkfind ${f.tone}`} key={i}>
          <span className="dot" />
          <div>
            <b>{f.title}</b>
            <p>{f.body}</p>
          </div>
        </div>
      ))}
    </>
  );
}

function MockCreativeCheck() {
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!running) return;
    const t = setTimeout(() => {
      setRunning(false);
      setDone(true);
    }, 700);
    return () => clearTimeout(t);
  }, [running]);

  return (
    <div className="field">
      <button
        type="button"
        className="btn sm primary"
        disabled={running}
        onClick={() => {
          setDone(false);
          setRunning(true);
        }}
      >
        {running ? "Checking…" : CHECK_LABELS.creative}
      </button>
      {done && (
        <div style={{ marginTop: 10 }}>
          <FindingsList findings={MOCK_CREATIVE_CHECK.findings} />
          <p className="checksource">
            Checked against {MOCK_CREATIVE_CHECK.against}. This is placeholder output — the real check isn&rsquo;t
            connected yet.
          </p>
        </div>
      )}
    </div>
  );
}

// brand's wording matters more than it looks: an earlier version ending
// "...and flag anywhere the copy drifts from it" reliably triggered
// Claude's own safety refusal (stop_reason "refusal", zero content)
// whenever a PDF was attached — reproduced consistently (8/8) against the
// real API while building this, isolated down to that exact closing
// clause (dropping only "protected terms" made no difference; dropping
// "flag anywhere...drifts" did). Rewording to "note anything worth
// reconsidering" produces the identical check with no refusals (0/8
// across repeated real calls) — a phrasing constraint, not a feature
// change, so if this needs editing again, re-test against a PDF
// attachment before assuming a wording tweak is safe.
const CHECK_INTROS: Record<"brand" | "wiifm", string> = {
  wiifm:
    "You check ad/social copy for its WIIFM (\"what's in it for me\") strength — whether it leads with a concrete reader benefit rather than a brand-centred claim, and whether it draws on a persuasion principle the agency has documented.",
  brand:
    "You review ad/social copy against this specific client's own brand knowledge — tone of voice, audience, protected terms, and anything else documented for them — and note anything worth reconsidering.",
};
const CHECK_REFERENCE_LABELS: Record<"brand" | "wiifm", string> = {
  wiifm: "Agency reference material",
  brand: "Client knowledge",
};
const CHECK_AGAINST_LABELS: Record<"brand" | "wiifm", string> = {
  wiifm: "the agency's Reference Material (Settings > Knowledge)",
  brand: "this client's Knowledge",
};
const CHECK_EMPTY_REFERENCE: Record<"brand" | "wiifm", string> = {
  wiifm: "No agency Reference Material yet — add some in Settings > Knowledge to make this check meaningful.",
  brand: "No Knowledge entries yet for this client — add some to make this check meaningful.",
};
const CHECK_FINDING_COUNT = 3;

interface CheckAttachmentRef {
  storageKey: string;
  mimeType: string;
  title: string;
}

function LiveCheck({
  kind,
  agencyId,
  concept,
  copyText,
  referenceNotes,
  attachments,
  knowledgeLoading,
}: {
  kind: "brand" | "wiifm";
  agencyId: string | undefined;
  concept: string | null;
  copyText: string;
  referenceNotes: string[];
  // PDF Reference Material/Knowledge — no body to fold into
  // referenceNotes, sent to the API route by reference (storage key), not
  // by value, so the route can read the actual bytes server-side.
  attachments: CheckAttachmentRef[];
  // Reference Material/Knowledge is fetched by the parent, already loaded
  // for Draft's own use — usually settled well before a real user reaches
  // this button. Still tracked explicitly so an empty array while still
  // loading doesn't get mistaken for "genuinely no knowledge configured".
  knowledgeLoading: boolean;
}) {
  const [findings, setFindings] = useState<CheckFinding[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const hasReference = referenceNotes.length > 0 || attachments.length > 0;
  const canRun = !!agencyId && !knowledgeLoading && !!copyText.trim() && hasReference;

  // Button-triggered, same as Draft's own runDraft() — this section is
  // always mounted now (its own place on the Checks tab, not something
  // that opens/closes), so there's no "just mounted" moment to hang an
  // auto-run effect off of. The reason a disabled button is disabled is
  // shown next to it instead of replacing the whole section.
  async function run() {
    if (!canRun || running) return;
    setRunning(true);
    setError(null);
    try {
      const prompt = buildCheckPrompt({
        intro: CHECK_INTROS[kind],
        concept,
        copyText,
        referenceLabel: CHECK_REFERENCE_LABELS[kind],
        referenceNotes,
        attachmentTitles: attachments.map((a) => a.title),
        findingCount: CHECK_FINDING_COUNT,
      });
      const res = await fetch("/api/ai/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agencyId, prompt, attachments }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't run this check");
      setFindings(parseCheckFindings(data.text));
    } catch (err) {
      setError(errorMessage(err, "Couldn't run this check"));
    } finally {
      setRunning(false);
    }
  }

  const disabledReason = knowledgeLoading
    ? null
    : !copyText.trim()
      ? `Add some copy first, then check it against ${CHECK_AGAINST_LABELS[kind]}.`
      : !hasReference
        ? CHECK_EMPTY_REFERENCE[kind]
        : null;

  return (
    <div className="field">
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <button type="button" className="btn sm primary" disabled={running || !canRun} onClick={run}>
          {running ? "Checking…" : CHECK_LABELS[kind]}
        </button>
        {error && <span className="berr">{error}</span>}
      </div>
      {!running && disabledReason && <p className="msection-empty" style={{ marginBottom: 6 }}>{disabledReason}</p>}
      {findings && findings.length > 0 && (
        <div>
          <FindingsList findings={findings} />
          <p className="checksource">Checked against {CHECK_AGAINST_LABELS[kind]}.</p>
        </div>
      )}
      {findings && findings.length === 0 && <p className="sub">No findings came back — try again.</p>}
    </div>
  );
}

function CheckSection({
  kind,
  agencyId,
  concept,
  copyText,
  referenceNotes,
  attachments,
  knowledgeLoading,
}: {
  kind: CheckKind;
  agencyId: string | undefined;
  concept: string | null;
  copyText: string;
  referenceNotes: string[];
  attachments: CheckAttachmentRef[];
  knowledgeLoading: boolean;
}) {
  if (kind === "creative") return <MockCreativeCheck />;
  return (
    <LiveCheck
      kind={kind}
      agencyId={agencyId}
      concept={concept}
      copyText={copyText}
      referenceNotes={referenceNotes}
      attachments={attachments}
      knowledgeLoading={knowledgeLoading}
    />
  );
}


// <input type="date">/<input type="time"> need "YYYY-MM-DD"/"HH:MM" in the
// browser's own local time, not the ISO string's UTC digits — reading the
// UTC fields directly would silently shift a piece scheduled at, say,
// 11pm local into the next day for anyone west of it.
function isoToDateInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function isoToTimeInput(iso: string | null): string {
  if (!iso) return "09:00";
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function CreativeModal(props: CreativeModalProps) {
  const { onClose } = props;
  const isCreate = props.mode === "create";

  const { data: agency } = useMyAgency();
  const agencyId = isCreate ? agency?.agencyId : props.creative.agency_id;
  const clientId = isCreate ? props.clientId : props.creative.projects?.client_id;
  const projectId = isCreate ? props.projectId : props.creative.project_id;

  const { data: teamMembers } = useTeamMembers(agency?.agencyId);
  const { data: customColumns } = useCustomColumns(projectId);
  const createCreative = useCreateCreative(projectId);

  // Once a fresh brief is created, its id lives here — unlocks the Upload
  // & Copy tab without needing to close and reopen this window (Tab 1
  // then shows what it just created, same fields, no longer blank), and
  // lets every further "Update" click amend that same row instead of
  // creating another one (see handleSaveBrief below).
  const [createdCreativeId, setCreatedCreativeId] = useState<string | null>(null);

  // Full history, newest first. Needed by both tabs: Brief's own Text on
  // Image field carries over from the latest copy version. In create mode
  // there's no parent to pass them, so once the brief exists they're read
  // here — otherwise a version saved in this same window never counted as
  // saved, and Save and Close stayed disabled after saving copy.
  const { data: createdCopyVersions } = useCopyVersions(isCreate ? (createdCreativeId ?? "") : "");
  const { data: createdCreativeVersions } = useCreativeVersions(isCreate ? (createdCreativeId ?? "") : "");
  const copyVersions = isCreate ? (createdCopyVersions ?? []) : props.copyVersions;
  const creativeVersions = isCreate ? (createdCreativeVersions ?? []) : props.creativeVersions;
  const latestCopyVersion = copyVersions[0] ?? null;
  // What saving copy right now would create — shown on both the inline
  // Save Copy button and the footer's own Save button whenever this
  // format has copy fields, so either one always names the version it's
  // about to add rather than a generic "Save".
  const nextCopyVersionNo = (latestCopyVersion?.version_no ?? 0) + 1;
  const latestCreativeVersionNo = creativeVersions[0]?.version_no ?? 0;
  const nextCreativeVersionNo = latestCreativeVersionNo + 1;

  // ---- Brief tab state ----------------------------------------------
  const [name, setName] = useState(isCreate ? "" : props.creative.name);
  // Every format the post goes out as; the first is the main one.
  const [formats, setFormats] = useState<string[]>(
    isCreate ? [formatsByCategory(FORMAT_CATEGORIES[0])[0]?.id ?? ""] : postFormats(props.creative),
  );
  const format = formats[0];
  // Carousels (phase31): a Slides count appears when any chosen format is
  // one, capped at the tightest of their limits. Text on Image then shows
  // one field per slide.
  const carouselMax = carouselMaxSlides(formats);
  const [slideCountChoice, setSlideCountChoice] = useState<number>(
    isCreate ? CAROUSEL_MIN_SLIDES : (props.creative.slide_count ?? CAROUSEL_MIN_SLIDES),
  );
  const slideCount = carouselMax ? Math.min(Math.max(slideCountChoice, CAROUSEL_MIN_SLIDES), carouselMax) : null;
  // Brief-time warning (docs/frank-data-intelligence.pdf, "Where it
  // surfaces — At the brief") — only meaningful while still choosing a
  // format for a new brief; an existing creative's format is fixed, so
  // there's nothing to warn about changing.
  const { data: repeatIssue } = useRepeatIssueCount(isCreate ? clientId : undefined, isCreate ? format : undefined);
  const [leadUserId, setLeadUserId] = useState(isCreate ? "" : (props.creative.lead_user_id ?? ""));
  const [date, setDate] = useState(isCreate ? "" : isoToDateInput(props.creative.scheduled_at));
  const [time, setTime] = useState(isCreate ? "09:00" : isoToTimeInput(props.creative.scheduled_at));
  const [destination, setDestination] = useState(isCreate ? "" : (props.creative.destination ?? ""));
  const [dueOn, setDueOn] = useState(isCreate ? "" : (props.creative.due_on ?? ""));
  const [concept, setConcept] = useState(isCreate ? "" : (props.creative.concept ?? ""));
  // Every reference link (phase58), at least one box to type into.
  const [referenceUrls, setReferenceUrls] = useState<string[]>(() => {
    const saved = isCreate ? [] : (props.creative.reference_urls ?? []);
    return saved.length ? saved : [""];
  });
  // Text on Image, one entry per slide: on the post itself, not a copy
  // version (phase57, direct instruction), with its own Save on the
  // Content tab. savedSlideText is what's on record, for "unsaved".
  const initialSlideText = isCreate ? [] : (props.creative.slide_text ?? []);
  const [slideText, setSlideText] = useState<string[]>(initialSlideText);
  const [savedSlideText, setSavedSlideText] = useState<string[]>(tidySlideText(initialSlideText));
  const [cx, setCx] = useState<Record<string, string | number | boolean | null>>({});
  // Continuous projects' Funnel and Notes for Designer (direct instruction:
  // in the window as well as the table, both optional). Saved to the same
  // cx keys the table writes.
  const savedTableFields = {
    funnel: isCreate ? "" : String(props.creative.cx?.funnel ?? ""),
    designer_notes: isCreate ? "" : String(props.creative.cx?.designer_notes ?? ""),
  };
  const [funnel, setFunnel] = useState(savedTableFields.funnel);
  const [designerNotes, setDesignerNotes] = useState(savedTableFields.designer_notes);
  const [savedFields, setSavedFields] = useState(savedTableFields);

  const [nameError, setNameError] = useState<string | null>(null);
  const [dateError, setDateError] = useState<string | null>(null);
  const [destinationError, setDestinationError] = useState<string | null>(null);

  // A brief flash beside Cancel after a successful "Update" (never shown
  // for the first "Create Post" save) — auto-hides rather than tracking
  // every field's dirty state, since unlike copySaveNote below it names
  // no specific version a later edit could make stale.
  const [showUpdatedNote, setShowUpdatedNote] = useState(false);
  const updatedNoteTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (updatedNoteTimeout.current) clearTimeout(updatedNoteTimeout.current);
  }, []);

  const creativeId = isCreate ? createdCreativeId : props.creative.id;

  const updateBrief = useUpdateBrief(creativeId ?? "");
  const updateCx = useUpdateCreativeCx(projectId);
  const delivery = isCreate ? props.delivery : (props.creative.projects?.delivery ?? "scheduled");

  const [activeTab, setActiveTab] = useState<Tab>(
    isCreate ? "brief" : (props.initialTab ?? "upload"),
  );

  // The format and slide count as last saved — what the artwork was made
  // for — to tell whether a change means it no longer fits.
  const [savedBrief, setSavedBrief] = useState<{ formats: string[]; slideCount: number | null } | null>(
    isCreate ? null : { formats: postFormats(props.creative), slideCount: props.creative.slide_count ?? null },
  );
  // Set while the "remove uploaded creatives?" warning is open.
  const [formatWarning, setFormatWarning] = useState<string[] | null>(null);
  const clearArtwork = useClearArtwork(creativeId ?? "");

  async function handleSaveBrief({ artworkCleared = false }: { artworkCleared?: boolean } = {}) {
    if (!name.trim()) {
      setNameError("Give the brief a name.");
      return;
    }
    setNameError(null);
    if (delivery === "scheduled" && !date) {
      setDateError("Pick a publish date.");
      return;
    }
    setDateError(null);
    if (delivery === "continuous" && !destination.trim()) {
      setDestinationError("Say where this goes.");
      return;
    }
    setDestinationError(null);

    const scheduledAt =
      delivery === "scheduled" ? new Date(`${date}T${time || "09:00"}:00`).toISOString() : null;

    // Only the very first save creates the row — `isCreate` alone stays
    // true for as long as this modal is open (it's fixed at mount from
    // props.mode), so without the `!creativeId` guard every further click
    // of what's now the same "Update" button inserted another creatives
    // row rather than amending the one just made.
    if (isCreate && !creativeId) {
      const newId = await createCreative.mutateAsync({
        name: name.trim(),
        formats,
        leadUserId: leadUserId || null,
        concept,
        referenceUrls: tidyReferences(referenceUrls),
        slideCount,
        cx:
          delivery === "continuous"
            ? {
                ...cx,
                ...(funnel ? { funnel } : {}),
                ...(designerNotes.trim() ? { designer_notes: designerNotes.trim() } : {}),
              }
            : cx,
        scheduledAt,
        destination: delivery === "continuous" ? destination.trim() : null,
        dueOn: delivery === "continuous" ? dueOn || null : null,
      });
      setCreatedCreativeId(newId);
      setSavedBrief({ formats, slideCount });
      setSavedFields({ funnel, designer_notes: designerNotes.trim() });
      props.onCreated?.(scheduledAt, delivery === "continuous" ? dueOn || null : null);
      return;
    }

    // Per direct instruction, a format change the uploaded artwork no longer
    // fits (lib/format-change.ts) warns that it will all be removed, and
    // only goes ahead once that's confirmed (confirmFormatChange below).
    if (!artworkCleared && savedBrief && creativeVersions.some((v) => versionSlides(v).length > 0)) {
      const uploadedSlides = Math.max(0, ...versionSlides(creativeVersions[0]).map((s) => s.position));
      const reasons = artworkChangeReasons(savedBrief, { formats, slideCount }, uploadedSlides);
      if (reasons.length) {
        setFormatWarning(reasons);
        return;
      }
    }

    // Direct instruction: name/format/lead/schedule become editable after
    // creation too — a deliberate reversal of this modal's own original
    // scope (see hooks/use-update-brief.ts). Runs both for a real edit
    // and for the second-and-later save of a brief created this session.
    await updateBrief.mutateAsync({
      name: name.trim(),
      formats,
      leadUserId: leadUserId || null,
      concept,
      referenceUrls: tidyReferences(referenceUrls),
      slideCount,
      scheduledAt,
      destination: delivery === "continuous" ? destination.trim() : null,
      dueOn: delivery === "continuous" ? dueOn || null : null,
    });
    setSavedBrief({ formats, slideCount });
    // Funnel and Notes for Designer, each its own atomic write (as the
    // table's), only when changed.
    if (delivery === "continuous" && creativeId) {
      const next = { funnel, designer_notes: designerNotes.trim() };
      for (const key of ["funnel", "designer_notes"] as const) {
        if (next[key] !== savedFields[key]) {
          await updateCx.mutateAsync({ creativeId, key, value: next[key] || null });
        }
      }
      setSavedFields(next);
    }
    if (updatedNoteTimeout.current) clearTimeout(updatedNoteTimeout.current);
    setShowUpdatedNote(true);
    updatedNoteTimeout.current = setTimeout(() => setShowUpdatedNote(false), 3000);
  }

  async function confirmFormatChange() {
    try {
      await clearArtwork.mutateAsync();
    } catch {
      return; // Shown in the warning itself.
    }
    setFormatWarning(null);
    setViewingCreativeVersionNo(0);
    await handleSaveBrief({ artworkCleared: true });
  }

  const briefSaving = isCreate
    ? createCreative.isPending
    : updateBrief.isPending || updateCx.isPending;
  const briefError = isCreate
    ? createCreative.error
    : updateBrief.error || updateCx.error;

  // ---- Content tab state ---------------------------------------

  // An at-a-glance signal of what's actually there yet, not just which tab
  // is active — carried by the tab label's own weight/colour now (bold +
  // ink once populated), not a separate dot. Brief counts as populated
  // once a real creative row exists (there's something to show, even
  // blank); Content counts once either side of it has real content.
  const briefPopulated = !!creativeId;
  const uploadPopulated = latestCreativeVersionNo > 0 || !!latestCopyVersion;

  const [fileError, setFileError] = useState<string | null>(null);
  const [copySaveNote, setCopySaveNote] = useState<string | null>(null);
  const [creativeSaveNote, setCreativeSaveNote] = useState<string | null>(null);

  // The editable draft always builds on the latest copy version.
  const [draftFields, setDraftFields] = useState<Record<string, string>>(latestCopyVersion?.fields ?? {});

  // Version tabs, for the artwork and (by direct instruction, the same way)
  // the copy: older versions open read only; the latest is where new work
  // happens. A tab whose version has just been deleted falls back to the
  // latest rather than pointing at nothing.
  const [viewingCreativeVersionNo, setViewingCreativeVersionNo] = useState(latestCreativeVersionNo);
  const viewedCreativeVersion =
    creativeVersions.find((v) => v.version_no === viewingCreativeVersionNo) ?? creativeVersions[0] ?? null;
  const isViewingLatestCreative = !viewedCreativeVersion || viewedCreativeVersion.id === creativeVersions[0]?.id;
  const [viewingCopyVersionNo, setViewingCopyVersionNo] = useState(latestCopyVersion?.version_no ?? 0);
  const viewedCopyVersion = copyVersions.find((v) => v.version_no === viewingCopyVersionNo) ?? latestCopyVersion;
  const isViewingLatestCopy = !viewedCopyVersion || viewedCopyVersion.id === latestCopyVersion?.id;

  // Delete Version (phase30): only a version with no comments on it.
  const deleteVersion = useDeletePostVersion(creativeId ?? "");
  const { data: postComments } = useComments(creativeId ?? "");
  const [deleteTarget, setDeleteTarget] = useState<{ kind: "creative" | "copy"; id: string; versionNo: number } | null>(
    null,
  );
  const deleteTargetComments = deleteTarget
    ? (postComments ?? []).filter((c) =>
        deleteTarget.kind === "creative" ? c.creative_version_id === deleteTarget.id : c.copy_version_id === deleteTarget.id,
      ).length
    : 0;

  async function confirmDeleteVersion() {
    if (!deleteTarget) return;
    const { kind, id } = deleteTarget;
    await deleteVersion.mutateAsync({ kind, versionId: id });
    if (kind === "copy") {
      const remaining = copyVersions.filter((v) => v.id !== id);
      // Deleting the latest: the draft goes back to building on the one
      // before it, rather than carrying the deleted text as unsaved edits.
      if (id === latestCopyVersion?.id) {
        setDraftFields(remaining[0]?.fields ?? {});
        setCopySaveNote(null);
      }
      setViewingCopyVersionNo(remaining[0]?.version_no ?? 0);
    } else {
      const remaining = creativeVersions.filter((v) => v.id !== id);
      setViewingCreativeVersionNo(remaining[0]?.version_no ?? 0);
      setCreativeSaveNote(null);
    }
    setDeleteTarget(null);
  }

  // "Write with Claude" (phase52), over this window.
  const [chatOpen, setChatOpen] = useState(false);

  // Where a save has got to (compressing a video, uploading), shown by the
  // uploader under the artwork.
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const uploadCarousel = useUploadCarouselVersion(creativeId ?? "", agencyId ?? "", latestCreativeVersionNo, setUploadProgress);
  const savingLabel = "Saving…";
  const [carouselPending, setCarouselPending] = useState(false);

  // A carousel's whole set of slides, saved as the next version.
  async function handleSaveCarousel(slides: SlideSource[]) {
    const targetVersionNo = nextCreativeVersionNo;
    setCreativeSaveNote(null);
    try {
      const versionId = await uploadCarousel.mutateAsync(slides);
      if (!isCreate) props.onCreativeVersionCreated(versionId);
      setViewingCreativeVersionNo(targetVersionNo);
      setCreativeSaveNote(`Saved as version ${targetVersionNo}.`);
    } catch {
      // Surfaced via uploadCarousel.error / uploadError below.
    } finally {
      setUploadProgress(null);
    }
  }
  const saveCopy = useSaveCopyFields(creativeId ?? "");
  const saveSlideText = useSaveSlideText(creativeId ?? "", projectId);
  const [slideSaveNote, setSlideSaveNote] = useState<string | null>(null);
  async function handleSaveSlideText() {
    setSlideSaveNote(null);
    try {
      await saveSlideText.mutateAsync(draftSlideText);
      setSavedSlideText(draftSlideText);
      setSlideSaveNote("Saved.");
    } catch {
      // Shown via saveSlideText.error below.
    }
  }
  const refreshWiifmNote = useRefreshWiifmNote(creativeId ?? "");

  // Same "not available in create mode" shape as copyVersions/creativeVersions
  // above — approach_notes lives on the creatives row itself, which doesn't
  // exist as props.creative until the brief has been saved once.
  const approachNotes = isCreate ? [] : (props.creative.approach_notes ?? []);

  const { data: aiSettings } = useAgencyAiSettings(agencyId);
  const { data: agencyKnowledge, isLoading: agencyKnowledgeLoading } = useAgencyKnowledge(agencyId);
  const { data: clientKnowledge, isLoading: clientKnowledgeLoading } = useKnowledgeEntries(clientId ?? "");
  const modelLabel = aiSettings
    ? (modelById(aiSettings.ai_default_model)?.label ?? aiSettings.ai_default_model)
    : null;

  // Shared by Draft and both Checks — every agency Reference Material /
  // client Knowledge text entry, no cap, no filtering beyond "has a body".
  // clientNotesLabeled additionally prefixes each note with its section
  // (Tone of Voice, Protected Terms, ...) — Check Brand cares which section
  // a note came from in a way Draft's own flatter prompt doesn't need to.
  const agencyNotes = useMemo(
    () => (agencyKnowledge ?? []).filter((e) => e.kind === "text" && e.body).map((e) => e.body as string),
    [agencyKnowledge],
  );
  const clientNotesLabeled = useMemo(
    () =>
      (clientKnowledge ?? [])
        .filter((e) => e.kind === "text" && e.body)
        .map((e) => `[${KNOWLEDGE_SECTION_LABELS[e.section] ?? e.section}] ${e.body}`),
    [clientKnowledge],
  );

  // A file-kind entry (a real agency's Reference Material is often
  // entirely PDFs, no typed notes at all) has no body to fold into
  // agencyNotes/clientNotesLabeled above — sent as real attachments
  // instead (see lib/ai/attachment.ts), PDF only for now.
  const agencyPdfAttachments = useMemo(
    () =>
      (agencyKnowledge ?? [])
        .filter((e) => e.kind === "file" && e.asset?.mime_type === "application/pdf")
        .map((e) => ({ storageKey: e.asset!.storage_key, mimeType: e.asset!.mime_type, title: e.title })),
    [agencyKnowledge],
  );
  const clientPdfAttachments = useMemo(
    () =>
      (clientKnowledge ?? [])
        .filter((e) => e.kind === "file" && e.asset?.mime_type === "application/pdf")
        .map((e) => ({ storageKey: e.asset!.storage_key, mimeType: e.asset!.mime_type, title: e.title })),
    [clientKnowledge],
  );

  // The chosen formats' own copy fields (lib/formats.ts), combined — Meta
  // Feed Ad needs primary/headline/description/cta, Instagram Feed just
  // caption/alt, so a post that's both gets all six, each once. Several
  // formats (Instagram Story, Packaging, ...) need none at all.
  const copyFieldSpecs: CopyFieldSpec[] = useMemo(
    () => copyFieldsFor(formats).map((key) => ({ key, label: COPY_FIELD_LABELS[key] ?? key })),
    [formats],
  );

  // No mode selector — Creative and Copy are always both shown, each its
  // own clearly separated section, and Save persists whichever one the
  // agency actually touched (a file picked, and/or copy fields, are each
  // independent — you don't have to choose one to work on at a time).
  const includesCopy = copyFieldSpecs.length > 0;
  const uploadSaving = uploadCarousel.isPending || saveCopy.isPending;

  // Whether Copy/Creative each have something a save would actually
  // persist right now — Copy's own dedicated Save button and Creative's
  // own (below) are how those get committed; the modal's own footer
  // button no longer does it silently on their behalf, so it needs these
  // same two answers to know whether it's safe to just close.
  const mergedCopyFields = { ...(latestCopyVersion?.fields ?? {}), ...draftFields };
  // A format with copy fields but nothing typed into any of them yet
  // (a brand-new creative, before the agency has written anything) isn't
  // "pending" just because no copy_versions row exists — there's nothing
  // there to lose, and blocking Save and Close over it would trap the
  // agency into creating an empty version just to unlock closing.
  const hasAnyCopyContent = Object.values(mergedCopyFields).some((v) => v?.trim());
  const pendingCopyChange =
    includesCopy &&
    hasAnyCopyContent &&
    !(!!latestCopyVersion && fieldsEqual(mergedCopyFields, latestCopyVersion.fields ?? {}));
  // Text on Image, saved on its own (not a version).
  const draftSlideText = tidySlideText(slideFields(slideText, slideCount));
  const pendingSlideChange = JSON.stringify(draftSlideText) !== JSON.stringify(savedSlideText);
  const pendingCreativeChange = carouselPending;

  // What Check WIIFM/Check Brand actually check — the fields as they
  // stand right now in the editable draft, not the last saved version.
  const copyTextForCheck = copyFieldSpecs
    .map((spec) => (draftFields[spec.key] ? `${spec.label}: ${draftFields[spec.key]}` : null))
    .filter((line): line is string => !!line)
    .join("\n");


  // Shared by the footer's Save (closes the modal after) and the inline
  // "Save Copy" button under the copy fields (doesn't) — the actual save,
  // skipped when the merged fields are byte-for-byte identical to the
  // latest version's, same no-op guard either way. Returns whether a new
  // version was actually created.
  async function saveCopyIfChanged(): Promise<boolean> {
    if (!pendingCopyChange) return false;

    const versionId = await saveCopy.mutateAsync({
      fields: draftFields,
      latest: latestCopyVersion,
    });
    if (!isCreate) props.onCopyVersionCreated(versionId);

    // "As and when copy versions get done, the system gives the WIIFM
    // Approach Note" — not awaited (Save Copy's own "Saved" confirmation
    // shouldn't wait on a second AI call), but tracked via the mutation's
    // own isPending/error rather than a fire-and-forget-and-forget fetch,
    // so the Checks tab's WIIFM Direction section can show "Updating…"
    // and pick up the result once it lands.
    if (agencyId && creativeId) {
      refreshWiifmNote.mutate(agencyId);
    }
    return true;
  }

  // The Creative and Copy sections each have their own dedicated Save
  // button now (below) — this is the footer's own, and since both of
  // those are the only things that actually create a new version, it's
  // disabled whenever either has something pending (pendingCopyChange /
  // pendingCreativeChange), so by the time it's clickable there's nothing
  // left for it to do but close. Artwork isn't required: a post can be
  // copy only, creative only, or both.
  async function handleSaveUpload() {
    await saveCopyIfChanged();
    onClose();
  }

  // The inline "Save Version N" button under the copy fields — saves just
  // the copy, same as saveCopyIfChanged() itself, but stays open (the
  // agency may still want to drop artwork, or run a Check against what
  // was just saved) and reports what happened next to the button rather
  // than via the modal closing.
  async function handleSaveCopyOnly() {
    // Captured before the save, not read back after — nextCopyVersionNo is
    // derived from state as it stands right now, which is exactly the
    // version number the save about to happen would create.
    const targetVersionNo = nextCopyVersionNo;
    setCopySaveNote(null);
    try {
      const saved = await saveCopyIfChanged();
      setCopySaveNote(saved ? `Saved as version ${targetVersionNo}.` : "No changes to save.");
      if (saved) setViewingCopyVersionNo(targetVersionNo);
    } catch {
      // Surfaced via saveCopy.error / uploadError below already.
    }
  }


  // "Write with Claude" (phase52): under the caption field.
  const writeWithClaude = (
    <div className="field">
      <button
        type="button"
        className="btn sm primary"
        disabled={!modelLabel || !creativeId}
        title={creativeId ? undefined : "Save the brief first"}
        onClick={() => setChatOpen(true)}
      >
        <svg className="aicon" viewBox="0 0 24 24">
          <path d="M12 3l1.8 6.2L20 11l-6.2 1.8L12 19l-1.8-6.2L4 11l6.2-1.8L12 3z" />
        </svg>
        {/* Named for Frank (direct instruction); the model is named in the
            window it opens. */}
        Draft with Frank
      </button>
    </div>
  );

  // The artwork's own problem shows by its Save button and progress bar
  // (reported directly: a failed video save looked like a loader that
  // stopped, its reason at the foot of the window); the copy's stays here.
  const artworkError =
    fileError || (uploadCarousel.error ? errorMessage(uploadCarousel.error, "Couldn't save the slides") : null);
  const uploadError = saveCopy.error ? errorMessage(saveCopy.error, "Couldn't save") : null;

  // Edit mode: project name up top, the post's own name and format
  // underneath it, smaller — e.g. "Winter Social Campaign" /
  // "No Fluff Founder Series - Instagram Reel". Create mode has neither a
  // real post name nor a settled format yet, so it keeps the plain,
  // single-line title.
  const title = isCreate ? (
    "New Post"
  ) : (
    <>
      <div className="modal-title-project">{props.creative.projects?.name ?? "Untitled Project"}</div>
      <div className="modal-title-post">
        {props.creative.name} - {formatsLabel(formats)}
      </div>
    </>
  );
  const titleAriaLabel = isCreate
    ? "New Post"
    : `${props.creative.projects?.name ?? "Untitled Project"} — ${props.creative.name}`;

  return (
    <>
    <Modal
      title={title}
      ariaLabel={titleAriaLabel}
      hideCloseButton
      onClose={onClose}
      footer={
        activeTab === "brief" ? (
          <>
            <div className="grow" />
            {showUpdatedNote && <span className="bsaved">Post updated.</span>}
            <button type="button" className="btn" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="btn primary"
              disabled={briefSaving}
              onClick={() => handleSaveBrief()}
            >
              {briefSaving ? "Saving…" : isCreate && !creativeId ? "Create Post" : "Update"}
            </button>
          </>
        ) : (
          <>
            <div className="grow" />
            <button type="button" className="btn" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="btn primary"
              disabled={uploadSaving || !creativeId || pendingCopyChange || pendingCreativeChange || pendingSlideChange}
              title={
                pendingCopyChange || pendingCreativeChange || pendingSlideChange
                  ? "Save the copy, Text on Image or creative changes above first"
                  : undefined
              }
              onClick={handleSaveUpload}
            >
              {uploadSaving ? "Saving…" : "Save and Close"}
            </button>
          </>
        )
      }
    >
      <div className="mtabs" role="tablist">
        <button
          type="button"
          className={`mtab${briefPopulated ? " populated" : ""}`}
          role="tab"
          aria-selected={activeTab === "brief"}
          onClick={() => setActiveTab("brief")}
        >
          Brief
        </button>
        <button
          type="button"
          className={`mtab${uploadPopulated ? " populated" : ""}`}
          role="tab"
          aria-selected={activeTab === "upload"}
          disabled={!creativeId}
          title={!creativeId ? "Save the brief first" : undefined}
          onClick={() => creativeId && setActiveTab("upload")}
        >
          Content
        </button>
        <button
          type="button"
          className="mtab"
          role="tab"
          aria-selected={activeTab === "checks"}
          disabled={!creativeId}
          title={!creativeId ? "Save the brief first" : undefined}
          onClick={() => creativeId && setActiveTab("checks")}
        >
          Checks
        </button>
      </div>

      {activeTab === "brief" && (
        <div className="mtabbody">
          <div className="msection-h">Details</div>
          <p className="msection-d">The basics — what this is, its format, when it&rsquo;s due, and who&rsquo;s leading it.</p>

          <div className="field">
            <label htmlFor="nbName">Post Name</label>
            <input
              id="nbName"
              className="bin one"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (nameError) setNameError(null);
              }}
              placeholder="e.g. Trials countdown — 3 days"
            />
            {nameError && <p className="autherr">{nameError}</p>}
          </div>

          <div className="field">
            <label htmlFor="nbFmt">
              Format <span className="hint">tick every format this goes out as</span>
            </label>
            <FormatPicker id="nbFmt" value={formats} onChange={setFormats} />
          </div>

          {carouselMax && (
            <div className="field">
              <label htmlFor="nbSlides">
                Slides <span className="hint">how many slides this carousel has</span>
              </label>
              <select
                id="nbSlides"
                value={slideCount ?? CAROUSEL_MIN_SLIDES}
                onChange={(e) => setSlideCountChoice(Number(e.target.value))}
              >
                {Array.from({ length: carouselMax - CAROUSEL_MIN_SLIDES + 1 }, (_, i) => i + CAROUSEL_MIN_SLIDES).map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
          )}

          {isCreate && repeatIssue && (
            <div className="note">
              <svg viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 16v-5M12 8h.01" />
              </svg>
              <div>
                This client has raised {repeatIssue.count} {repeatIssue.label} issues on{" "}
                {formatsLabel([format])} in the last 90 days.
              </div>
            </div>
          )}

          {delivery === "scheduled" ? (
            // Date and time side by side, without the browser's own pickers
            // inside them; the one picker sits at the end of the row
            // (direct instruction).
            <div className="frow dtrow">
              <div className="field">
                <label htmlFor="nbDate">Publish Date</label>
                <input
                  id="nbDate"
                  className="bin one"
                  type="date"
                  value={date}
                  onChange={(e) => {
                    setDate(e.target.value);
                    if (dateError) setDateError(null);
                  }}
                />
                {dateError && <p className="autherr">{dateError}</p>}
              </div>
              <div className="field">
                <label htmlFor="nbTime">Time</label>
                <div className="dtrow-time">
                  <input
                    id="nbTime"
                    className="bin one"
                    type="time"
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                  />
                  <DateTimePicker
                    date={date}
                    time={time}
                    onChangeDate={(v) => {
                      setDate(v);
                      if (dateError) setDateError(null);
                    }}
                    onChangeTime={setTime}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="frow">
              <div className="field">
                <label htmlFor="nbDest">Destination</label>
                <input
                  id="nbDest"
                  className="bin one"
                  value={destination}
                  onChange={(e) => {
                    setDestination(e.target.value);
                    if (destinationError) setDestinationError(null);
                  }}
                  placeholder="ASIN, URL or location"
                />
                {destinationError && <p className="autherr">{destinationError}</p>}
              </div>
              <div className="field">
                <label htmlFor="nbDue">Live Date</label>
                <input
                  id="nbDue"
                  className="bin one"
                  type="date"
                  value={dueOn}
                  onChange={(e) => setDueOn(e.target.value)}
                />
              </div>
            </div>
          )}

          <div className="field">
            <label htmlFor="nbLead">Lead</label>
            <select
              id="nbLead"
              className="bin one"
              value={leadUserId}
              onChange={(e) => setLeadUserId(e.target.value)}
            >
              <option value="">Unassigned</option>
              {(teamMembers ?? []).map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.user?.name ?? "—"}
                </option>
              ))}
            </select>
          </div>

          <div className="msection-h">Concept</div>
          <p className="msection-d">What is being made and why — the brief the Content tab drafts against.</p>

          <div className="field">
            <label htmlFor="nbConcept">Concept</label>
            <textarea
              id="nbConcept"
              className="bin"
              rows={4}
              value={concept}
              onChange={(e) => setConcept(e.target.value)}
              placeholder="What the piece says, who it is for, what it is answering, and how it should look."
            />
          </div>

          <div className="field">
            <label htmlFor="nbRef">
              References <span className="bnote">optional</span>
            </label>
            {referenceUrls.map((url, i) => {
              const href = linkHref(url);
              return (
                <div className="refrow" key={i}>
                  <input
                    id={i === 0 ? "nbRef" : undefined}
                    className="bin one"
                    aria-label={`Reference ${i + 1}`}
                    value={url}
                    onChange={(e) =>
                      setReferenceUrls((prev) => prev.map((u, k) => (k === i ? e.target.value : u)))
                    }
                    placeholder="A post, article or page this is modelled on"
                  />
                  {href && (
                    <a className="btn sm" href={href} target="_blank" rel="noreferrer" aria-label={`Open reference ${i + 1}`}>
                      Open
                    </a>
                  )}
                  {referenceUrls.length > 1 && (
                    <button
                      type="button"
                      className="refx"
                      aria-label={`Remove reference ${i + 1}`}
                      onClick={() => setReferenceUrls((prev) => prev.filter((_, k) => k !== i))}
                    >
                      ×
                    </button>
                  )}
                </div>
              );
            })}
            <button type="button" className="badd" onClick={() => setReferenceUrls((prev) => [...prev, ""])}>
              + Add Reference
            </button>
          </div>

          {delivery === "continuous" && (
            <>
              <div className="field">
                <label htmlFor="nbFunnel">
                  Funnel <span className="bnote">optional</span>
                </label>
                <select id="nbFunnel" className="bin one" value={funnel} onChange={(e) => setFunnel(e.target.value)}>
                  <option value="">Not set</option>
                  {(FUNNEL_COLUMN.options ?? []).map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="nbNotes">
                  Notes for Designer <span className="bnote">optional</span>
                </label>
                <textarea
                  id="nbNotes"
                  className="bin"
                  rows={3}
                  value={designerNotes}
                  onChange={(e) => setDesignerNotes(e.target.value)}
                  placeholder="What the designer should know: sizes, references, things to avoid."
                />
              </div>
            </>
          )}

          {isCreate && customColumns && customColumns.length > 0 && (
            <div className="field">
              <label>Project Fields</label>
              {customColumns.map((col) => (
                <div className="brow" key={col.id}>
                  <b>{col.label}</b>
                  <CxCell
                    column={col}
                    value={cx[col.key] ?? null}
                    onSave={(value) => setCx((prev) => ({ ...prev, [col.key]: value }))}
                  />
                </div>
              ))}
            </div>
          )}

          {briefError && <p className="autherr">{errorMessage(briefError, "Couldn't save the brief")}</p>}
        </div>
      )}

      {activeTab === "upload" && creativeId && (
        <div className="mtabbody">
          <div className="msection-h">Creative</div>
          <p className="msection-d">The artwork or video for this post.</p>
          <div className="field">
            {creativeVersions.length > 0 && (
                <div className="viewbar" style={{ marginBottom: 10 }}>
                  {[...creativeVersions].reverse().map((v) => (
                    <VersionTab
                      key={v.version_no}
                      versionNo={v.version_no}
                      selected={viewedCreativeVersion?.id === v.id}
                      onSelect={() => setViewingCreativeVersionNo(v.version_no)}
                      onDelete={() => setDeleteTarget({ kind: "creative", id: v.id, versionNo: v.version_no })}
                    />
                  ))}
                </div>
              )}

              {/* One slot per slide, or one for a post that isn't a
                  carousel: the same layout either way (direct instruction). */}
              <CarouselSlots
                slideCount={slideCount ?? 1}
                latest={creativeVersions[0] ?? null}
                readOnlyVersion={isViewingLatestCreative ? null : viewedCreativeVersion}
                aspectRatio={aspectRatioCss(format)}
                nextVersionNo={nextCreativeVersionNo}
                saving={uploadCarousel.isPending}
                savingLabel={savingLabel}
                saveNote={creativeSaveNote}
                onSave={handleSaveCarousel}
                onPendingChange={setCarouselPending}
                onError={setFileError}
              />
            </div>

          {uploadProgress && uploadCarousel.isPending && (
            <UploadProgressBar progress={uploadProgress} />
          )}
          {artworkError && !uploadCarousel.isPending && <p className="autherr">{artworkError}</p>}

          {/* Its own section after the artwork (direct instruction), saved
              on the post, not as a version (phase57). */}
          <div className="msection-h">Text on Image</div>
          <p className="msection-d">
            {slideCount ? "The words on each slide's artwork, one entry per slide." : "The words on the artwork itself."}
          </p>
          <ListEditor
            itemLabel={(i) => (slideCount ? `Slide ${i + 1}` : "Text on Image")}
            values={slideFields(slideText, slideCount ?? 1)}
            onChange={(next) => {
              setSlideText(next);
              setSlideSaveNote(null);
            }}
            fixed
            bare
          />
          <div className="field">
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button
                type="button"
                className="btn sm primary"
                disabled={!creativeId || !pendingSlideChange || saveSlideText.isPending}
                onClick={handleSaveSlideText}
              >
                {saveSlideText.isPending ? "Saving…" : "Save Text on Image"}
              </button>
              {slideSaveNote && !pendingSlideChange && <span className="bsaved">{slideSaveNote}</span>}
            </div>
            {saveSlideText.error && (
              <p className="autherr">{errorMessage(saveSlideText.error, "Couldn't save the Text on Image")}</p>
            )}
          </div>

          <div className="msection-h">Copy</div>
          <p className="msection-d">
            The caption and on-post text the chosen formats need, saved as versions.
          </p>

          {copyVersions.length > 0 && (
            <div className="viewbar" style={{ marginBottom: 10 }}>
              {[...copyVersions].reverse().map((v) => (
                <VersionTab
                  key={v.version_no}
                  versionNo={v.version_no}
                  selected={viewedCopyVersion?.id === v.id}
                  onSelect={() => setViewingCopyVersionNo(v.version_no)}
                  onDelete={() => setDeleteTarget({ kind: "copy", id: v.id, versionNo: v.version_no })}
                />
              ))}
            </div>
          )}

          {!isViewingLatestCopy && viewedCopyVersion && (
            <>
              <p className="sub" style={{ marginBottom: 10 }}>
                An earlier version, read only. New copy builds on the latest, V{latestCopyVersion?.version_no}.
              </p>
              {copyFieldSpecs.map((spec) => (
                <div className="field" key={spec.key}>
                  <label>{spec.label}</label>
                  <p className="fd-d">{viewedCopyVersion.fields?.[spec.key] || "—"}</p>
                </div>
              ))}
            </>
          )}

          {isViewingLatestCopy && (
            <>
              {!includesCopy && (
                <p className="msection-empty">
                  {formats.length > 1 ? "These formats have" : `${formatsLabel(formats)} has`} no caption fields, only Text on
                  Image.
                </p>
              )}

              {copyFieldSpecs.map((spec, i) => (
                <Fragment key={spec.key}>
                <div className="field">
                  <label>{spec.label}</label>
                  {LONG_COPY_FIELDS.has(spec.key) ? (
                    <textarea
                      className="bin"
                      rows={spec.key === "caption" ? 6 : 3}
                      value={draftFields[spec.key] ?? ""}
                      onChange={(e) => {
                        setDraftFields((prev) => ({ ...prev, [spec.key]: e.target.value }));
                        setCopySaveNote(null);
                      }}
                    />
                  ) : (
                    <input
                      className="bin one"
                      value={draftFields[spec.key] ?? ""}
                      onChange={(e) => {
                        setDraftFields((prev) => ({ ...prev, [spec.key]: e.target.value }));
                        setCopySaveNote(null);
                      }}
                    />
                  )}
                </div>
                {/* Under the caption (direct instruction), or under the
                    last field when the formats have no caption. */}
                {(spec.key === "caption" ||
                  (!copyFieldSpecs.some((f) => f.key === "caption") && i === copyFieldSpecs.length - 1)) &&
                  writeWithClaude}
                </Fragment>
              ))}
              {!includesCopy && writeWithClaude}

              <div className="field">
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <button type="button" className="btn sm primary" disabled={saveCopy.isPending} onClick={handleSaveCopyOnly}>
                    {saveCopy.isPending ? "Saving…" : `Save Copy V${nextCopyVersionNo}`}
                  </button>
                  {copySaveNote && (
                    <span className={copySaveNote.startsWith("Saved") ? "bsaved" : "sub"}>{copySaveNote}</span>
                  )}
                </div>
              </div>
            </>
          )}


          {uploadError && <p className="autherr">{uploadError}</p>}
        </div>
      )}

      {activeTab === "checks" && creativeId && (
        <div className="mtabbody">
          <div className="msection-h">
            {latestCopyVersion ? `Latest Copy Version ${latestCopyVersion.version_no}` : "Latest Copy Version"}
          </div>
          <p className="msection-d">The most recently saved copy — read only, edit it from the Content tab.</p>
          {!latestCopyVersion ? (
            <p className="msection-empty">No copy saved yet.</p>
          ) : (
            [
              ...copyFieldSpecs.map((spec) => ({ key: spec.key, label: spec.label })),
              { key: "__slides", label: "Text on Image" },
            ].map((spec) => {
              if (spec.key === "__slides") {
                const text = savedSlideText;
                return text.some((t) => t.trim()) ? (
                  <div className="field" key={spec.key}>
                    <label>{spec.label}</label>
                    {text.map((t, i) => (
                      <p className="fd-d" key={i}>
                        {slideCount ? <b>{`Slide ${i + 1}: `}</b> : null}
                        {t || "—"}
                      </p>
                    ))}
                  </div>
                ) : null;
              }
              const value = latestCopyVersion.fields?.[spec.key];
              return value ? (
                <div className="field" key={spec.key}>
                  <label>{spec.label}</label>
                  <p className="fd-d">{value}</p>
                </div>
              ) : null;
            })
          )}

          <div className="msection-h">WIIFM Direction</div>
          <p className="msection-d">
            What a reader actually gets from the latest copy — read only, regenerated every time copy is saved.
          </p>
          {refreshWiifmNote.isPending ? (
            <p className="sub">Updating…</p>
          ) : refreshWiifmNote.isError ? (
            <p className="autherr">{errorMessage(refreshWiifmNote.error, "Couldn't update the WIIFM direction")}</p>
          ) : approachNotes.length > 0 ? (
            <div className="field">
              {approachNotes.map((note, i) => (
                <p className="fd-d" key={i}>
                  {note}
                </p>
              ))}
            </div>
          ) : latestCopyVersion && agencyId ? (
            // Copy is saved but the note wasn't written (the AI wasn't
            // reachable then, say): write it now.
            <p className="msection-empty">
              The copy is saved, but its WIIFM direction hasn&rsquo;t been written.{" "}
              <button type="button" className="badd" onClick={() => refreshWiifmNote.mutate(agencyId)}>
                Write It Now
              </button>
            </p>
          ) : (
            <p className="msection-empty">No WIIFM direction yet — save some copy to generate one.</p>
          )}

          {(Object.keys(CHECK_LABELS) as CheckKind[]).map((kind) => (
            <Fragment key={kind}>
              <div className="msection-h">{CHECK_LABELS[kind]}</div>
              <p className="msection-d">{CHECK_SECTION_DESCRIPTIONS[kind]}</p>
              <CheckSection
                kind={kind}
                agencyId={agencyId}
                concept={concept}
                copyText={copyTextForCheck}
                referenceNotes={kind === "wiifm" ? agencyNotes : kind === "brand" ? clientNotesLabeled : []}
                attachments={kind === "wiifm" ? agencyPdfAttachments : kind === "brand" ? clientPdfAttachments : []}
                knowledgeLoading={kind === "wiifm" ? agencyKnowledgeLoading : clientKnowledgeLoading}
              />
            </Fragment>
          ))}
        </div>
      )}

    </Modal>
    {formatWarning && (
      <ConfirmDialog
        title="Remove uploaded creatives?"
        message="changing the format will remove all uploaded creatives — every artwork version, its files, and any comments on them. This can't be undone."
        details={formatWarning}
        confirmLabel="Change Format and Remove"
        pendingLabel="Removing…"
        isPending={clearArtwork.isPending || updateBrief.isPending}
        error={clearArtwork.error}
        errorFallback="Couldn't remove the artwork"
        onConfirm={() => confirmFormatChange().catch(() => {})}
        onClose={() => {
          setFormatWarning(null);
          clearArtwork.reset();
        }}
      />
    )}
    {deleteTarget && (
      <ConfirmDialog
        title={`Delete ${deleteTarget.kind === "creative" ? "Creative" : "Copy"} Version ${deleteTarget.versionNo}?`}
        message={
          deleteTargetComments > 0
            ? `this version has ${deleteTargetComments} comment${deleteTargetComments === 1 ? "" : "s"}, so it can't be deleted. Only a version nobody has commented on can be.`
            : `Version ${deleteTarget.versionNo} of the ${deleteTarget.kind === "creative" ? "artwork" : "copy"} will be gone for good. The other versions keep their numbers. This can't be undone.`
        }
        confirmLabel="Delete Version"
        pendingLabel="Deleting…"
        isPending={deleteVersion.isPending}
        error={deleteVersion.error}
        errorFallback="Couldn't delete this version"
        onConfirm={deleteTargetComments > 0 ? undefined : () => confirmDeleteVersion().catch(() => {})}
        onClose={() => {
          setDeleteTarget(null);
          deleteVersion.reset();
        }}
      />
    )}
    {chatOpen && creativeId && (
      <CopyChat
        creativeId={creativeId}
        fields={[...copyFieldSpecs, ...slideTextFields(slideCount)]}
        currentFields={{ ...draftFields, ...slideTextAsFields(slideFields(slideText, slideCount)) }}
        onUse={(fields) => {
          // The caption fields into the copy, the slides into Text on Image.
          const copy = Object.fromEntries(Object.entries(fields).filter(([key]) => !isSlideField(key)));
          setDraftFields((prev) => ({ ...prev, ...copy }));
          setSlideText((prev) => applySlideDraft(slideFields(prev, slideCount), fields));
          setCopySaveNote(null);
        }}
        onClose={() => setChatOpen(false)}
      />
    )}
    </>
  );
}

// A version tab with a small X at its top right on hover (or keyboard
// focus) — the X has its own hover — that asks to delete the version.
function VersionTab({
  versionNo,
  selected,
  onSelect,
  onDelete,
}: {
  versionNo: number;
  selected: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  return (
    <span className="vtabwrap">
      <button type="button" role="tab" className="vtab" aria-selected={selected} onClick={onSelect}>
        V{versionNo}
      </button>
      <button
        type="button"
        className="vtab-x"
        title={`Delete Version ${versionNo}`}
        aria-label={`Delete Version ${versionNo}`}
        onClick={onDelete}
      >
        <svg viewBox="0 0 24 24">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
    </span>
  );
}
