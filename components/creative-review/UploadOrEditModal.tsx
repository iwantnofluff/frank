"use client";

import { useEffect, useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import type { CopyVersionRow } from "@/hooks/use-copy-versions";
import { useUploadCreativeVersion } from "@/hooks/use-upload-creative-version";
import { useSaveCopyFields } from "@/hooks/use-save-copy-fields";
import { validateUploadFile, ACCEPTED_FILE_EXTENSIONS } from "@/lib/upload-validation";
import { errorMessage } from "@/lib/errors";

type Mode = "creative" | "both" | "copy";

// Labels and hints match frank-prototype.html's #upScrim segmented control
// exactly (data-up="creative"|"both"|"copy").
const MODES: { value: Mode; title: string; hint: string }[] = [
  { value: "creative", title: "Creative Only", hint: "Image, video or carousel" },
  { value: "both", title: "Creative and Copy", hint: "Renders as a real post" },
  { value: "copy", title: "Copy Only", hint: "Captions and text on image" },
];

type CheckKind = "brand" | "wiifm" | "creative";

const CHECK_LABELS: Record<CheckKind, string> = {
  wiifm: "Check WIIFM",
  creative: "Check Creative",
  brand: "Check Brand",
};

// Icons match #chkWiifm/#chkCreative/#chkBrand in frank-prototype.html.
function CheckIcon({ kind }: { kind: CheckKind }) {
  if (kind === "wiifm") {
    return (
      <svg viewBox="0 0 24 24">
        <path d="M9 11l3 3L22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </svg>
    );
  }
  if (kind === "creative") {
    return (
      <svg viewBox="0 0 24 24">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <path d="M21 15l-5-5L5 21" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24">
      <path d="M12 3l7 4v5c0 4.4-3 8.4-7 9.5C8 20.4 5 16.4 5 12V7z" />
      <path d="M9.5 12l1.8 1.8L15 10" />
    </svg>
  );
}

const CHECK_COPY: Record<
  CheckKind,
  { against: string; findings: { tone: "warn" | "ok"; title: string; body: string }[] }
> = {
  brand: {
    against: "the client's tone and audience notes",
    findings: [
      {
        tone: "warn",
        title: "Mock finding — exclamation mark",
        body: "\"Book your spot today!\" — the tone note says no exclamation marks.",
      },
      {
        tone: "ok",
        title: "Mock finding — sentence length",
        body: "Sentences are short throughout, matching the tone note.",
      },
    ],
  },
  wiifm: {
    against: "the approach note on this brief and the agency's principle library",
    findings: [
      {
        tone: "warn",
        title: "Mock finding — WIIFM not detected",
        body: "The brief claims scarcity, but the copy doesn't use it yet.",
      },
    ],
  },
  creative: {
    against: "protected terms, line lengths and the format spec — not the image itself",
    findings: [
      {
        tone: "ok",
        title: "Mock finding — protected terms",
        body: "No protected term collisions found in the on-artwork text.",
      },
      {
        tone: "warn",
        title: "Mock finding — line length",
        body: "Line 2 runs to nine words; the format spec asks for six or fewer.",
      },
    ],
  },
};

function CheckModalBody({ kind }: { kind: CheckKind }) {
  const [running, setRunning] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setRunning(false), 700);
    return () => clearTimeout(t);
  }, []);

  if (running) return <p className="sub">Running…</p>;

  const { against, findings } = CHECK_COPY[kind];
  return (
    <div>
      {findings.map((f, i) => (
        <div className={`checkfind ${f.tone}`} key={i}>
          <span className="dot" />
          <div>
            <b>{f.title}</b>
            <p>{f.body}</p>
          </div>
        </div>
      ))}
      <p className="checksource">
        Checked against {against}. This is placeholder output — the real
        check isn&rsquo;t connected yet.
      </p>
    </div>
  );
}

export function UploadOrEditModal({
  creativeId,
  agencyId,
  projectName,
  latestCreativeVersionNo,
  latestCopyVersion,
  defaultMode,
  onClose,
  onCreativeVersionCreated,
  onCopyVersionCreated,
}: {
  creativeId: string;
  agencyId: string;
  projectName: string;
  latestCreativeVersionNo: number;
  latestCopyVersion: CopyVersionRow | null;
  defaultMode: Mode;
  onClose: () => void;
  onCreativeVersionCreated: (versionId: string) => void;
  onCopyVersionCreated: (versionId: string) => void;
}) {
  const [mode, setMode] = useState<Mode>(defaultMode);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [caption, setCaption] = useState(latestCopyVersion?.fields?.caption ?? "");
  const [headline, setHeadline] = useState(latestCopyVersion?.fields?.headline ?? "");
  const [cta, setCta] = useState(latestCopyVersion?.fields?.cta ?? "");
  const [activeCheck, setActiveCheck] = useState<CheckKind | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  const uploadCreative = useUploadCreativeVersion(
    creativeId,
    agencyId,
    latestCreativeVersionNo,
  );
  const saveCopy = useSaveCopyFields(creativeId);

  const includesCreative = mode === "creative" || mode === "both";
  const includesCopy = mode === "copy" || mode === "both";
  const saving = uploadCreative.isPending || saveCopy.isPending;

  // Matches frank-prototype.html's upTitle()/renderUpOut() text exactly.
  const title =
    mode === "copy" ? "Edit Copy" : mode === "creative" ? "Upload Artwork" : "Upload Artwork and Copy";

  const latestCopyVersionNo = latestCopyVersion?.version_no ?? 0;
  const versionOut = [
    includesCreative &&
      `creative ${latestCreativeVersionNo > 0 ? "V" + latestCreativeVersionNo : "—"} → V${latestCreativeVersionNo + 1}`,
    includesCopy &&
      `copy ${latestCopyVersionNo > 0 ? "V" + latestCopyVersionNo : "—"} → V${latestCopyVersionNo + 1}`,
    mode === "creative" && latestCopyVersionNo > 0 && `copy stays at V${latestCopyVersionNo}`,
    mode === "copy" && latestCreativeVersionNo > 0 && `creative stays at V${latestCreativeVersionNo}`,
  ]
    .filter(Boolean)
    .join(" · ");
  const error =
    fileError ||
    (uploadCreative.error ? errorMessage(uploadCreative.error, "Couldn't upload") : null) ||
    (saveCopy.error ? errorMessage(saveCopy.error, "Couldn't save") : null);

  function pickFile(f: File) {
    const validation = validateUploadFile(f);
    if (!validation.ok) {
      setFileError(validation.message);
      return;
    }
    setFileError(null);
    setFile(f);
  }

  async function handleSave() {
    if (includesCreative && !file) {
      setFileError("Choose a file to upload.");
      return;
    }

    if (includesCreative && file) {
      const versionId = await uploadCreative.mutateAsync(file);
      onCreativeVersionCreated(versionId);
    }

    if (includesCopy) {
      const versionId = await saveCopy.mutateAsync({
        fields: { caption, headline, cta },
        latest: latestCopyVersion,
      });
      onCopyVersionCreated(versionId);
    }

    onClose();
  }

  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <span className="grow">{versionOut}</span>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={saving}
            onClick={handleSave}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </>
      }
    >
      <div className="ctxbar">
        <span className="cx-v">{projectName}</span>
      </div>

      <div className="field">
        <label>What Are You Uploading?</label>
        <div className="seg">
          {MODES.map((m) => (
            <button
              key={m.value}
              type="button"
              className="segbtn"
              aria-pressed={mode === m.value}
              onClick={() => setMode(m.value)}
            >
              <b>{m.title}</b>
              <span>{m.hint}</span>
            </button>
          ))}
        </div>
      </div>

      {includesCreative && (
        <div className="field">
          <label>Creative File</label>
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
                <span>
                  JPG, PNG, WebP, GIF up to 25MB — MP4, MOV up to 500MB
                </span>
              </>
            )}
          </div>
        </div>
      )}

      {includesCopy && (
        <>
          <div className="field">
            <label>Caption</label>
            <textarea
              className="bin"
              rows={3}
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
            />
          </div>
          <div className="frow">
            <div className="field">
              <label>Headline</label>
              <input
                className="bin one"
                value={headline}
                onChange={(e) => setHeadline(e.target.value)}
              />
            </div>
            <div className="field">
              <label>Call to action</label>
              <input
                className="bin one"
                value={cta}
                onChange={(e) => setCta(e.target.value)}
              />
            </div>
          </div>

          {/* Under the copy fields, matching frank-prototype.html's
              #checkRow placement inside the upload panel. */}
          <div className="field">
            <div className="checks">
              {(Object.keys(CHECK_LABELS) as CheckKind[]).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  className="btn sm chk"
                  onClick={() => setActiveCheck(kind)}
                >
                  <CheckIcon kind={kind} />
                  {CHECK_LABELS[kind]}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {error && <p className="autherr">{error}</p>}

      {activeCheck && (
        <Modal title={CHECK_LABELS[activeCheck]} onClose={() => setActiveCheck(null)}>
          <CheckModalBody kind={activeCheck} />
        </Modal>
      )}
    </Modal>
  );
}
