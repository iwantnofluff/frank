"use client";

import { useMemo } from "react";
import { useIgnoreSuggestion, useProofread } from "@/hooks/use-proofread";
import { useMyAgency } from "@/hooks/use-my-agency";
import { useProofreadRules } from "@/hooks/use-proofread-rules";
import { applySuggestion, isProse, openSuggestions, paragraphSuggestions, type ProofreadSuggestion } from "@/lib/proofread";
import { proofreadField, resolveRules, type ResolvedRules } from "@/lib/proofread-rules";
import { errorMessage } from "@/lib/errors";

// Before exact suggestions were marked, these kinds were only ever exact.
const EXACT_KINDS = new Set(["paragraph", "spacing", "repeat", "word", "capital"]);
const isExact = (s: ProofreadSuggestion) => !!s.exact || EXACT_KINDS.has(s.kind);

// A field's open suggestions: the AI's still there and not ignored, and the
// exact checks worked out from the words as they are now (so fixing one
// thing never leaves another behind), less any ignored.
function openFor(field: string, text: string, ai: ProofreadSuggestion[], rules: ResolvedRules | null, ignored: Set<string>) {
  if (!rules) return ai.filter((s) => s.field === field && text.includes(s.from) && !ignored.has(s.id));
  return proofreadField(field, text, rules, ai, paragraphSuggestions, isProse).filter((s) => !ignored.has(s.id));
}

// A saved version's proofread under its field (phase121, direct
// instruction): each suggestion with Fix, which puts it into the editor
// (saved when the person saves), and Ignore, which keeps it hidden for
// good; Fix All when there are several. One goes by itself once its words
// are changed.
export function ProofreadList({
  versionId,
  current,
  labels,
  onFix,
  running,
  error,
}: {
  versionId: string | null | undefined;
  // The field's words as they are in the editor, by key.
  current: Record<string, string>;
  labels: Record<string, string>;
  // The field's new words.
  onFix: (field: string, text: string) => void;
  running: boolean;
  error?: unknown;
}) {
  const { data } = useProofread(versionId);
  const ignore = useIgnoreSuggestion(versionId);
  const { data: agency } = useMyAgency();
  const { data: ruleRows } = useProofreadRules(agency?.agencyId);
  const rules = useMemo(() => (ruleRows ? resolveRules(ruleRows) : null), [ruleRows]);
  if (running)
    return (
      <p className="proof-note" role="status">
        Frank is proofreading what you saved
        {/* Draft with Frank's dots (direct instruction). */}
        <span className="cchat-dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
      </p>
    );
  if (error) return <p className="autherr">{errorMessage(error, "Frank couldn't proofread it")}</p>;
  if (!data) return null;
  const ignored = new Set(data.ignored);
  const ai = openSuggestions(data.suggestions.filter((s) => !isExact(s)), data.ignored, current);
  const open = Object.entries(current).flatMap(([field, text]) => openFor(field, text ?? "", ai, rules, ignored));
  if (!open.length) return data.suggestions.length || data.ignored.length ? null : <p className="proof-note">Proofread: nothing to fix.</p>;

  const fix = (s: ProofreadSuggestion) => onFix(s.field, applySuggestion(current[s.field] ?? "", s));
  // The AI's fixes first, then the exact checks again on the words they
  // leave, one at a time, until there's nothing left to fix.
  const fixAll = () => {
    for (const [field, start] of Object.entries(current)) {
      let text = start ?? "";
      for (const s of open.filter((x) => x.field === field && !x.exact)) text = applySuggestion(text, s);
      for (let i = 0; i < 50; i++) {
        const next = openFor(field, text, [], rules, ignored)[0];
        if (!next) break;
        const after = applySuggestion(text, next);
        if (after === text) break;
        text = after;
      }
      if (text !== start) onFix(field, text);
    }
  };
  const shown = (t: string) => t.replace(/\n/g, " ⏎ ");
  // The field named only when the suggestions are about more than one.
  const manyFields = new Set(open.map((s) => s.field)).size > 1;

  return (
    <div className="proof" role="region" aria-label="Proofread">
      <div className="proof-h">
        <b>Proofread</b>
        <span className="tdim">
          {open.length} suggestion{open.length === 1 ? "" : "s"}, nothing changed until you Fix and save
        </span>
        {open.length > 1 && (
          <button type="button" className="proof-pill fix" onClick={fixAll}>
            Fix All
          </button>
        )}
      </div>
      <ul>
        {open.map((s) => (
          <li key={s.id}>
            <span className="proof-t">
              {manyFields && <span className="proof-f">{labels[s.field] ?? s.field}</span>}
              <del>{shown(s.from)}</del> <span aria-hidden="true">→</span> <ins>{shown(s.to)}</ins>
              {s.reason && <span className="proof-r">{s.reason}</span>}
            </span>
            <span className="proof-acts">
              <button type="button" className="proof-pill fix" aria-label={`Fix: ${s.from} to ${s.to}`} onClick={() => fix(s)}>
                Fix
              </button>
              <button
                type="button"
                className="proof-pill"
                aria-label={`Ignore: ${s.from}`}
                disabled={ignore.isPending}
                onClick={() => ignore.mutate([s.id])}
              >
                Ignore
              </button>
            </span>
          </li>
        ))}
      </ul>
      {ignore.error && <p className="autherr">{errorMessage(ignore.error, "Couldn't ignore it")}</p>}
    </div>
  );
}
