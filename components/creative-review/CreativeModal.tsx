"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { ListEditor } from "@/components/ui/ListEditor";
import { CxCell } from "@/components/project/CxCell";
import type { CreativeRow } from "@/hooks/use-creative";
import type { CopyVersionRow } from "@/hooks/use-copy-versions";
import type { CreativeVersionRow } from "@/hooks/use-creative-versions";
import { useCreateCreative } from "@/hooks/use-create-creative";
import { useUpdateBrief } from "@/hooks/use-update-brief";
import { useSaveSlideText } from "@/hooks/use-save-slide-text";
import { useTeamMembers } from "@/hooks/use-team-members";
import { useMyAgency } from "@/hooks/use-my-agency";
import { useCustomColumns } from "@/hooks/use-custom-columns";
import { useUploadCreativeVersion } from "@/hooks/use-upload-creative-version";
import { useSaveCopyFields } from "@/hooks/use-save-copy-fields";
import { useRefreshWiifmNote } from "@/hooks/use-refresh-wiifm-note";
import { useAssetSignedUrl } from "@/hooks/use-asset-signed-url";
import { useAgencyAiSettings } from "@/hooks/use-agency-ai-settings";
import { useFormatDirections } from "@/hooks/use-format-directions";
import { useAgencyKnowledge } from "@/hooks/use-agency-knowledge";
import { useKnowledgeEntries } from "@/hooks/use-knowledge-entries";
import { FORMAT_CATEGORIES, formatsByCategory, formatById, COPY_FIELD_LABELS } from "@/lib/formats";
import { validateUploadFile, ACCEPTED_FILE_EXTENSIONS } from "@/lib/upload-validation";
import {
  buildCaptionPrompt,
  parseDraftOptions,
  type CopyFieldSpec,
  type DraftOption,
} from "@/lib/ai/build-caption-prompt";
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
      onCreated?: (scheduledAt: string | null) => void;
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
        {!running && disabledReason && <span className="sub">{disabledReason}</span>}
        {error && <span className="berr">{error}</span>}
      </div>
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

// A historical creative version — read only, no rework action. Unlike a
// copy version there's no text to copy into a new draft; the only way to
// supersede a file is to upload a genuinely new one (the latest tab's own
// drop zone), so this just lets the agency look at or download what was
// there before.
function CreativeVersionPreview({ version }: { version: CreativeVersionRow }) {
  const { data: signedUrl, isLoading } = useAssetSignedUrl(version.asset?.storage_key);
  const isImage = version.asset?.mime_type.startsWith("image/");
  const isVideo = version.asset?.mime_type.startsWith("video/");

  return (
    <div className="drop has-file" style={{ cursor: "default" }}>
      {isLoading && <p className="sub">Loading…</p>}
      {!isLoading && signedUrl && isImage && (
        <img src={signedUrl} alt={version.asset?.filename ?? ""} style={{ maxWidth: "100%", borderRadius: "var(--r)" }} />
      )}
      {!isLoading && signedUrl && isVideo && (
        <video src={signedUrl} controls style={{ maxWidth: "100%", borderRadius: "var(--r)" }} />
      )}
      <b>{version.asset?.filename ?? "No file"}</b>
      <span>
        Uploaded {new Date(version.created_at).toLocaleDateString()}
        {signedUrl && (
          <>
            {" "}
            ·{" "}
            <a href={signedUrl} target="_blank" rel="noreferrer">
              Open
            </a>
          </>
        )}
      </span>
    </div>
  );
}

const OPTION_COUNT = 3;

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

  // Full history, newest first — empty in create mode, since neither can
  // exist before the brief itself does. Needed by both tabs: Brief's own
  // Text on Image field carries over from the latest copy version.
  const copyVersions = isCreate ? [] : props.copyVersions;
  const creativeVersions = isCreate ? [] : props.creativeVersions;
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
  const [category, setCategory] = useState<string>(
    isCreate ? FORMAT_CATEGORIES[0] : (formatById(props.creative.format)?.category ?? FORMAT_CATEGORIES[0]),
  );
  const formatsInCategory = useMemo(() => formatsByCategory(category), [category]);
  const [format, setFormat] = useState(isCreate ? (formatsInCategory[0]?.id ?? "") : props.creative.format);
  const [leadUserId, setLeadUserId] = useState(isCreate ? "" : (props.creative.lead_user_id ?? ""));
  const [date, setDate] = useState(isCreate ? "" : isoToDateInput(props.creative.scheduled_at));
  const [time, setTime] = useState(isCreate ? "09:00" : isoToTimeInput(props.creative.scheduled_at));
  const [destination, setDestination] = useState(isCreate ? "" : (props.creative.destination ?? ""));
  const [dueOn, setDueOn] = useState(isCreate ? "" : (props.creative.due_on ?? ""));
  const [concept, setConcept] = useState(isCreate ? "" : (props.creative.concept ?? ""));
  const [referenceUrl, setReferenceUrl] = useState(isCreate ? "" : (props.creative.reference_url ?? ""));
  const initialSlideText = isCreate ? [] : (latestCopyVersion?.slide_text ?? []);
  const [slideText, setSlideText] = useState<string[]>(initialSlideText);
  const [cx, setCx] = useState<Record<string, string | number | boolean | null>>({});

  const [nameError, setNameError] = useState<string | null>(null);
  const [dateError, setDateError] = useState<string | null>(null);
  const [destinationError, setDestinationError] = useState<string | null>(null);

  const updateBrief = useUpdateBrief(isCreate ? "" : props.creative.id);
  const saveSlideText = useSaveSlideText(isCreate ? "" : props.creative.id);

  // Once a fresh brief is created, its id lives here — unlocks the Upload
  // & Copy tab without needing to close and reopen this window (Tab 1
  // then shows what it just created, same fields, no longer blank).
  const [createdCreativeId, setCreatedCreativeId] = useState<string | null>(null);
  const creativeId = isCreate ? createdCreativeId : props.creative.id;
  const delivery = isCreate ? props.delivery : (props.creative.projects?.delivery ?? "scheduled");

  const [activeTab, setActiveTab] = useState<Tab>(
    isCreate ? "brief" : (props.initialTab ?? "upload"),
  );

  function handleCategoryChange(next: string) {
    setCategory(next);
    setFormat(formatsByCategory(next)[0]?.id ?? "");
  }

  async function handleSaveBrief() {
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

    if (isCreate) {
      const newId = await createCreative.mutateAsync({
        name: name.trim(),
        format,
        leadUserId: leadUserId || null,
        concept,
        referenceUrl,
        slideText,
        cx,
        scheduledAt,
        destination: delivery === "continuous" ? destination.trim() : null,
        dueOn: delivery === "continuous" ? dueOn || null : null,
      });
      setCreatedCreativeId(newId);
      props.onCreated?.(scheduledAt);
      return;
    }

    // Direct instruction: name/format/lead/schedule become editable after
    // creation too — a deliberate reversal of this modal's own original
    // scope (see hooks/use-update-brief.ts).
    await updateBrief.mutateAsync({
      name: name.trim(),
      format,
      leadUserId: leadUserId || null,
      concept,
      referenceUrl,
      scheduledAt,
      destination: delivery === "continuous" ? destination.trim() : null,
      dueOn: delivery === "continuous" ? dueOn || null : null,
    });
    const cleaned = slideText.map((s) => s.trim());
    if (JSON.stringify(cleaned) !== JSON.stringify(initialSlideText)) {
      await saveSlideText.mutateAsync({ slideText: cleaned, latest: latestCopyVersion });
    }
  }

  const briefSaving = isCreate
    ? createCreative.isPending
    : updateBrief.isPending || saveSlideText.isPending;
  const briefError = isCreate
    ? createCreative.error
    : updateBrief.error || saveSlideText.error;

  // ---- Content tab state ---------------------------------------

  // An at-a-glance signal of what's actually there yet, not just which tab
  // is active — carried by the tab label's own weight/colour now (bold +
  // ink once populated), not a separate dot. Brief counts as populated
  // once a real creative row exists (there's something to show, even
  // blank); Content counts once either side of it has real content.
  const briefPopulated = !!creativeId;
  const uploadPopulated = latestCreativeVersionNo > 0 || !!latestCopyVersion;

  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [copySaveNote, setCopySaveNote] = useState<string | null>(null);
  const [creativeSaveNote, setCreativeSaveNote] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  // Copy version tabs (browse-an-old-version, Rework) were removed —
  // direct instruction, "too cluttered." Only the current draft shows now;
  // older versions still exist in the database (nothing here deletes
  // them), there's just no in-modal way to browse or rework them.
  const [draftFields, setDraftFields] = useState<Record<string, string>>(latestCopyVersion?.fields ?? {});

  const [viewingCreativeVersionNo, setViewingCreativeVersionNo] = useState(latestCreativeVersionNo);
  const isViewingLatestCreative = creativeVersions.length === 0 || viewingCreativeVersionNo === latestCreativeVersionNo;

  const [draftOptions, setDraftOptions] = useState<DraftOption[] | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);

  const uploadCreative = useUploadCreativeVersion(creativeId ?? "", agencyId ?? "", latestCreativeVersionNo);
  const saveCopy = useSaveCopyFields(creativeId ?? "");
  const refreshWiifmNote = useRefreshWiifmNote(creativeId ?? "");

  // Same "not available in create mode" shape as copyVersions/creativeVersions
  // above — approach_notes lives on the creatives row itself, which doesn't
  // exist as props.creative until the brief has been saved once.
  const approachNotes = isCreate ? [] : (props.creative.approach_notes ?? []);

  const { data: aiSettings } = useAgencyAiSettings(agencyId);
  const { data: formatDirections } = useFormatDirections(agencyId);
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

  // This format's own copy fields (lib/formats.ts) — Meta Feed Ad needs
  // primary/headline/description/cta, Instagram Feed just caption/alt,
  // several formats (Instagram Story, Packaging, ...) need none at all.
  // Never a fixed caption/headline/cta triple regardless of format.
  const copyFieldSpecs: CopyFieldSpec[] = useMemo(
    () => (formatById(format)?.copyFields ?? []).map((key) => ({ key, label: COPY_FIELD_LABELS[key] ?? key })),
    [format],
  );

  // No mode selector — Creative and Copy are always both shown, each its
  // own clearly separated section, and Save persists whichever one the
  // agency actually touched (a file picked, and/or copy fields, are each
  // independent — you don't have to choose one to work on at a time).
  const includesCopy = copyFieldSpecs.length > 0;
  const uploadSaving = uploadCreative.isPending || saveCopy.isPending;

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
  const pendingCreativeChange = !!file;

  // What Check WIIFM/Check Brand actually check — the fields as they
  // stand right now in the editable draft, not the last saved version.
  const copyTextForCheck = copyFieldSpecs
    .map((spec) => (draftFields[spec.key] ? `${spec.label}: ${draftFields[spec.key]}` : null))
    .filter((line): line is string => !!line)
    .join("\n");

  function pickFile(f: File) {
    const validation = validateUploadFile(f);
    if (!validation.ok) {
      setFileError(validation.message);
      return;
    }
    setFileError(null);
    setFile(f);
    setCreativeSaveNote(null);
  }

  async function runDraft() {
    if (!agencyId || !clientId || copyFieldSpecs.length === 0) return;
    setDraftError(null);
    setDrafting(true);
    setDraftOptions(null);
    try {
      const formatDef = formatById(format);
      const direction = formatDirections?.find((d) => d.format_id === format)?.direction_text ?? null;
      const clientNotes = (clientKnowledge ?? [])
        .filter((e) => e.kind === "text" && e.body)
        .map((e) => e.body as string);

      const prompt = buildCaptionPrompt({
        concept,
        approachNotes,
        formatLabel: formatDef?.label ?? format,
        formatDirection: direction,
        agencyNotes,
        clientNotes,
        optionCount: OPTION_COUNT,
        fields: copyFieldSpecs,
      });

      const res = await fetch("/api/ai/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agencyId, prompt }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't draft from the brief");
      setDraftOptions(parseDraftOptions(data.text, copyFieldSpecs));
    } catch (err) {
      setDraftError(errorMessage(err, "Couldn't draft from the brief"));
    } finally {
      setDrafting(false);
    }
  }

  function applyDraftOption(option: DraftOption) {
    setDraftFields(option.fields);
    setDraftOptions(null);
  }

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
  // left for it to do beyond the one hard requirement neither of those
  // buttons enforces on its own: a creative needs *some* artwork before
  // this modal can close, not just save.
  async function handleSaveUpload() {
    if (creativeVersions.length === 0) {
      setFileError("Choose a file to upload.");
      return;
    }
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
    } catch {
      // Surfaced via saveCopy.error / uploadError below already.
    }
  }

  // Same idea, Creative side — the only other thing that creates a new
  // version. Clears the picked file on success (nothing left pending to
  // save, and creativeVersions now includes it once the mutation's own
  // invalidateQueries resolves) rather than leaving it sitting picked.
  async function handleSaveCreativeOnly() {
    if (!file) return;
    const targetVersionNo = nextCreativeVersionNo;
    setCreativeSaveNote(null);
    try {
      const versionId = await uploadCreative.mutateAsync(file);
      if (!isCreate) props.onCreativeVersionCreated(versionId);
      setFile(null);
      // viewingCreativeVersionNo was pinned at mount (0 for a creative
      // with no artwork yet) and nothing else moves it — without this,
      // going from zero versions to one while the modal stays open (only
      // reachable through this button; every other save path used to
      // close the modal, discarding this same stale state on unmount)
      // left isViewingLatestCreative false and CreativeVersionPreview
      // crashed looking up a version number that doesn't exist.
      setViewingCreativeVersionNo(targetVersionNo);
      setCreativeSaveNote(`Saved as version ${targetVersionNo}.`);
    } catch {
      // Surfaced via uploadCreative.error / uploadError below already.
    }
  }

  const uploadError =
    fileError ||
    (uploadCreative.error ? errorMessage(uploadCreative.error, "Couldn't upload") : null) ||
    (saveCopy.error ? errorMessage(saveCopy.error, "Couldn't save") : null);

  // Edit mode: project name up top, the post's own name and format
  // underneath it, smaller — e.g. "Winter Social Campaign" /
  // "No Fluff Founder Series - Instagram Reel". Create mode has neither a
  // real post name nor a settled format yet, so it keeps the plain,
  // single-line title.
  const title = isCreate ? (
    "New Brief"
  ) : (
    <>
      <div className="modal-title-project">{props.creative.projects?.name ?? "Untitled Project"}</div>
      <div className="modal-title-post">
        {props.creative.name} - {formatById(format)?.label ?? format}
      </div>
    </>
  );
  const titleAriaLabel = isCreate
    ? "New Brief"
    : `${props.creative.projects?.name ?? "Untitled Project"} — ${props.creative.name}`;

  return (
    <Modal
      title={title}
      ariaLabel={titleAriaLabel}
      hideCloseButton
      onClose={onClose}
      footer={
        activeTab === "brief" ? (
          <>
            <div className="grow" />
            <button type="button" className="btn" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="btn primary"
              disabled={briefSaving}
              onClick={handleSaveBrief}
            >
              {briefSaving ? "Saving…" : isCreate && !creativeId ? "Create Brief" : "Save Brief"}
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
              disabled={uploadSaving || !creativeId || pendingCopyChange || pendingCreativeChange}
              title={
                pendingCopyChange || pendingCreativeChange
                  ? "Save the copy and/or creative changes above first"
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
        <>
          <div className="msection-h">Details</div>
          <p className="msection-d">The basics — what this is, its format, when it&rsquo;s due, and who&rsquo;s leading it.</p>

          <div className="field">
            <label htmlFor="nbName">What Is It Called?</label>
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

          <div className="frow">
            <div className="field">
              <label htmlFor="nbCat">Content Type</label>
              <select
                id="nbCat"
                className="bin one"
                value={category}
                onChange={(e) => handleCategoryChange(e.target.value)}
              >
                {FORMAT_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="nbFmt">Format</label>
              <select
                id="nbFmt"
                className="bin one"
                value={format}
                onChange={(e) => setFormat(e.target.value)}
              >
                {formatsInCategory.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {delivery === "scheduled" ? (
            <div className="frow">
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
                <input
                  id="nbTime"
                  className="bin one"
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                />
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
                <label htmlFor="nbDue">Needed By</label>
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
              Reference Link <span className="bnote">optional</span>
            </label>
            <input
              id="nbRef"
              className="bin one"
              value={referenceUrl}
              onChange={(e) => setReferenceUrl(e.target.value)}
              placeholder="A post, article or page this is modelled on"
            />
          </div>

          <div className="msection-h">Text on Image</div>
          <p className="msection-d">
            On-artwork text, one entry per slide — separate from the caption or on-post copy on the Content tab.
          </p>
          <ListEditor
            itemLabel={(i) => `Slide ${i + 1}`}
            values={slideText}
            onChange={setSlideText}
            bare
          />

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
        </>
      )}

      {activeTab === "upload" && creativeId && (
        <>
          <div className="msection-h">Creative</div>
          <p className="msection-d">The artwork or video for this post.</p>
          <div className="field">
            {creativeVersions.length > 0 && (
                <div className="viewbar" style={{ marginBottom: 10 }}>
                  {[...creativeVersions].reverse().map((v) => (
                    <button
                      key={v.version_no}
                      type="button"
                      role="tab"
                      className="vtab"
                      aria-selected={viewingCreativeVersionNo === v.version_no}
                      onClick={() => setViewingCreativeVersionNo(v.version_no)}
                    >
                      V{v.version_no}
                    </button>
                  ))}
                </div>
              )}

              {!isViewingLatestCreative ? (
                <CreativeVersionPreview
                  version={creativeVersions.find((v) => v.version_no === viewingCreativeVersionNo)!}
                />
              ) : (
                <>
                  {creativeVersions.length > 0 && !file && (
                    <p className="sub" style={{ marginBottom: 8 }}>
                      Current: {creativeVersions[0].asset?.filename ?? "—"} · uploaded{" "}
                      {new Date(creativeVersions[0].created_at).toLocaleDateString()}. Drop a file below to
                      replace it with a new version.
                    </p>
                  )}
                  <div
                    className={`drop${dragActive ? " over" : ""}${file ? " has-file" : ""}`}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragActive(true);
                    }}
                    onDragLeave={() => setDragActive(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragActive(false);
                      const f = e.dataTransfer.files?.[0];
                      if (f) pickFile(f);
                    }}
                    onClick={() => inputRef.current?.click()}
                  >
                    <input
                      ref={inputRef}
                      type="file"
                      accept={ACCEPTED_FILE_EXTENSIONS}
                      style={{ display: "none" }}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) pickFile(f);
                        e.target.value = "";
                      }}
                    />
                    <svg viewBox="0 0 24 24">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <path d="M7 10l5-5 5 5" />
                      <path d="M12 5v13" />
                    </svg>
                    {file ? (
                      <b>{file.name}</b>
                    ) : (
                      <>
                        <b>Drop a file, or browse</b>
                        <span>JPG, PNG, WebP, GIF up to 25MB — MP4, MOV up to 500MB</span>
                      </>
                    )}
                  </div>

                  {file && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
                      <button
                        type="button"
                        className="btn sm primary"
                        disabled={uploadCreative.isPending}
                        onClick={handleSaveCreativeOnly}
                      >
                        {uploadCreative.isPending ? "Saving…" : `Save Version ${nextCreativeVersionNo}`}
                      </button>
                    </div>
                  )}
                  {/* Outside the {file && ...} block on purpose — saving
                      clears `file` (there's nothing left picked once it's
                      persisted), which would otherwise unmount this note
                      in the same render before it ever became visible. */}
                  {!file && creativeSaveNote && (
                    <p className="bsaved" style={{ marginTop: 10 }}>
                      {creativeSaveNote}
                    </p>
                  )}
                </>
              )}
            </div>

          <div className="msection-h">Copy</div>
          <p className="msection-d">The caption and on-post text, matched to what this format needs.</p>
          {!includesCopy && (
            <p className="sub">
              {formatById(format)?.label ?? "This format"} has no caption fields — text lives in Text on
              Image only (Brief tab).
            </p>
          )}

          {includesCopy && (
            <>
              <div className="field">
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <button
                    type="button"
                    className="btn sm primary"
                    disabled={drafting || !modelLabel}
                    onClick={runDraft}
                  >
                    <svg className="aicon" viewBox="0 0 24 24">
                      <path d="M12 3l1.8 6.2L20 11l-6.2 1.8L12 19l-1.8-6.2L4 11l6.2-1.8L12 3z" />
                    </svg>
                    {drafting ? "Drafting…" : modelLabel ? `Draft with ${modelLabel}` : "Draft"}
                  </button>
                  {draftError && <span className="berr">{draftError}</span>}
                </div>

                {draftOptions && (
                  <div style={{ marginBottom: 8 }}>
                    {draftOptions.map((opt, i) => (
                      <div className="draftopt" key={i}>
                        <div className="draftopt-h">
                          <b>{opt.principle}</b>
                        </div>
                        {copyFieldSpecs.map(
                          (spec) =>
                            opt.fields[spec.key] && (
                              <p key={spec.key}>
                                <b>{spec.label}: </b>
                                {opt.fields[spec.key]}
                              </p>
                            ),
                        )}
                        <div className="draftopt-acts">
                          <button type="button" className="btn sm primary" onClick={() => applyDraftOption(opt)}>
                            Use this
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {copyFieldSpecs.map((spec) => (
                <div className="field" key={spec.key}>
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
              ))}

              <div className="field">
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <button type="button" className="btn sm primary" disabled={saveCopy.isPending} onClick={handleSaveCopyOnly}>
                    {saveCopy.isPending ? "Saving…" : `Save Version ${nextCopyVersionNo}`}
                  </button>
                  {copySaveNote && (
                    <span className={copySaveNote.startsWith("Saved") ? "bsaved" : "sub"}>{copySaveNote}</span>
                  )}
                </div>
              </div>
            </>
          )}

          {uploadError && <p className="autherr">{uploadError}</p>}
        </>
      )}

      {activeTab === "checks" && creativeId && (
        <>
          <div className="msection-h">
            {latestCopyVersion ? `Latest Copy Version ${latestCopyVersion.version_no}` : "Latest Copy Version"}
          </div>
          <p className="msection-d">The most recently saved copy — read only, edit it from the Content tab.</p>
          {!includesCopy ? (
            <p className="sub">{formatById(format)?.label ?? "This format"} has no caption fields.</p>
          ) : !latestCopyVersion ? (
            <p className="sub">No copy saved yet.</p>
          ) : (
            copyFieldSpecs.map((spec) => {
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
          ) : (
            <p className="sub">No WIIFM direction yet — save some copy to generate one.</p>
          )}

          {(Object.keys(CHECK_LABELS) as CheckKind[]).map((kind) => (
            <div key={kind}>
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
            </div>
          ))}
        </>
      )}
    </Modal>
  );
}
