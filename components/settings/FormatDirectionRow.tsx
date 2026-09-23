"use client";

import { useState } from "react";
import type { FormatDefinition } from "@/lib/formats";
import type { FormatDirectionRow as FormatDirectionRecord } from "@/hooks/use-format-directions";
import { useUpsertFormatDirection } from "@/hooks/use-format-direction-mutations";
import { errorMessage } from "@/lib/errors";

// The meta line ports the prototype's own composition exactly (frank-prototype.html,
// renderMethod()'s fd-row) — "no caption" is real prototype copy, not a placeholder
// invented here. Sentences and artwork lines are left out entirely rather than shown
// as "–" when a format has never been customized (record is a stub, every numeric
// field null) — the prototype's own demo data never has a null to render in the
// first place, so there's no precedent for what that should look like blank.
function metaLine(record: FormatDirectionRecord | undefined) {
  const parts = [record?.caption_chars ? `${record.caption_chars} chars` : "no caption"];
  if (record?.sentences_min != null && record?.sentences_max != null) {
    parts.push(`${record.sentences_min}–${record.sentences_max} sentences`);
  }
  if (record?.artwork_lines) {
    parts.push(`${record.artwork_lines} line${record.artwork_lines > 1 ? "s" : ""} on artwork`);
  }
  return parts.join(" · ");
}

export function FormatDirectionRow({
  agencyId,
  format,
  record,
}: {
  agencyId: string;
  format: FormatDefinition;
  record: FormatDirectionRecord | undefined;
}) {
  const [editing, setEditing] = useState(false);
  const [direction, setDirection] = useState(record?.direction_text ?? "");
  const [captionChars, setCaptionChars] = useState(record?.caption_chars?.toString() ?? "");
  const [sentencesMin, setSentencesMin] = useState(record?.sentences_min?.toString() ?? "");
  const [sentencesMax, setSentencesMax] = useState(record?.sentences_max?.toString() ?? "");
  const [artworkLines, setArtworkLines] = useState(record?.artwork_lines?.toString() ?? "");
  const [wordsPerLine, setWordsPerLine] = useState(record?.words_per_line?.toString() ?? "");
  const [capsRule, setCapsRule] = useState(record?.caps_rule ?? "");

  const upsert = useUpsertFormatDirection(agencyId);

  function toIntOrNull(value: string) {
    return value.trim() === "" ? null : Number(value);
  }

  async function handleSave() {
    await upsert.mutateAsync({
      format_id: format.id,
      direction_text: direction.trim() || null,
      caption_chars: toIntOrNull(captionChars),
      sentences_min: toIntOrNull(sentencesMin),
      sentences_max: toIntOrNull(sentencesMax),
      artwork_lines: toIntOrNull(artworkLines),
      words_per_line: toIntOrNull(wordsPerLine),
      caps_rule: capsRule.trim() || null,
    });
    setEditing(false);
  }

  return (
    <div className="fd-row">
      <div className="fd-h">
        <b>{format.label}</b>
        <span className="fd-m">{metaLine(record)}</span>
        <button
          type="button"
          className="fbtn"
          onClick={() => setEditing((e) => !e)}
        >
          {editing ? "Close" : "Edit"}
        </button>
      </div>

      {!editing && record?.direction_text && <div className="fd-d">{record.direction_text}</div>}

      {editing && (
        <div className="fd-edit">
          <div className="bsec">
            <div className="bl">Direction</div>
            <textarea
              className="bin"
              rows={3}
              value={direction}
              onChange={(e) => setDirection(e.target.value)}
              placeholder="Written for whoever writes the brief."
            />
          </div>

          <div className="bsec bmeta">
            <div>
              <div className="bl">Caption length (chars)</div>
              <input
                className="bin one"
                type="number"
                value={captionChars}
                onChange={(e) => setCaptionChars(e.target.value)}
              />
            </div>
            <div>
              <div className="bl">Sentences (min)</div>
              <input
                className="bin one"
                type="number"
                value={sentencesMin}
                onChange={(e) => setSentencesMin(e.target.value)}
              />
            </div>
            <div>
              <div className="bl">Sentences (max)</div>
              <input
                className="bin one"
                type="number"
                value={sentencesMax}
                onChange={(e) => setSentencesMax(e.target.value)}
              />
            </div>
            <div>
              <div className="bl">Artwork lines</div>
              <input
                className="bin one"
                type="number"
                value={artworkLines}
                onChange={(e) => setArtworkLines(e.target.value)}
              />
            </div>
            <div>
              <div className="bl">Words per line</div>
              <input
                className="bin one"
                type="number"
                value={wordsPerLine}
                onChange={(e) => setWordsPerLine(e.target.value)}
              />
            </div>
            <div>
              <div className="bl">Case</div>
              <input
                className="bin one"
                type="text"
                placeholder="e.g. capitals, as written"
                value={capsRule}
                onChange={(e) => setCapsRule(e.target.value)}
              />
            </div>
          </div>

          <div className="bfoot">
            <button
              type="button"
              className="btn primary sm"
              disabled={upsert.isPending}
              onClick={handleSave}
            >
              {upsert.isPending ? "Saving…" : "Save"}
            </button>
            <div className="grow" />
            {upsert.error && (
              <span className="berr">{errorMessage(upsert.error, "Couldn't save")}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
