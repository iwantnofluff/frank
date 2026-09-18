"use client";

import { useState } from "react";
import type { FormatDirectionRow } from "@/hooks/use-format-directions";
import { useUpsertFormatDirection } from "@/hooks/use-format-direction-mutations";

export function FormatDirectionCard({
  agencyId,
  record,
  defaultOpen = false,
}: {
  agencyId: string;
  record: FormatDirectionRow;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [direction, setDirection] = useState(record.direction_text ?? "");
  const [captionChars, setCaptionChars] = useState(
    record.caption_chars?.toString() ?? "",
  );
  const [sentencesMin, setSentencesMin] = useState(
    record.sentences_min?.toString() ?? "",
  );
  const [sentencesMax, setSentencesMax] = useState(
    record.sentences_max?.toString() ?? "",
  );
  const [artworkLines, setArtworkLines] = useState(
    record.artwork_lines?.toString() ?? "",
  );
  const [wordsPerLine, setWordsPerLine] = useState(
    record.words_per_line?.toString() ?? "",
  );
  const [capsRule, setCapsRule] = useState(record.caps_rule ?? "");

  const upsert = useUpsertFormatDirection(agencyId);

  function toIntOrNull(value: string) {
    return value.trim() === "" ? null : Number(value);
  }

  async function handleSave() {
    await upsert.mutateAsync({
      format_id: record.format_id,
      direction_text: direction.trim() || null,
      caption_chars: toIntOrNull(captionChars),
      sentences_min: toIntOrNull(sentencesMin),
      sentences_max: toIntOrNull(sentencesMax),
      artwork_lines: toIntOrNull(artworkLines),
      words_per_line: toIntOrNull(wordsPerLine),
      caps_rule: capsRule.trim() || null,
    });
  }

  return (
    <div className={`brief${open ? " open" : ""}`}>
      <button
        type="button"
        className="bf-h"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <b>{record.format_id}</b>
        {upsert.isSuccess && <span className="bn">Saved</span>}
        <svg viewBox="0 0 24 24">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="bf-b">
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
              <span className="berr">
                {upsert.error instanceof Error
                  ? upsert.error.message
                  : "Couldn't save"}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
