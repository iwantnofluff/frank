"use client";

import { useState } from "react";
import { defaultSize, formatById, hasSize, sizeLabel, sizePresets, type FormatSize, type FormatSizes } from "@/lib/formats";

// The post window's Size field, under Format (phase139, decided directly):
// a size for each chosen format, its default picked to start with, one of
// the platform's other common sizes, or a custom width and height in
// pixels. Only a size other than the default is kept, so a post left at
// the default follows it. The review screen draws the post at this shape.
export function FormatSizeFields({
  formats,
  value,
  onChange,
}: {
  formats: string[];
  value: FormatSizes;
  onChange: (next: FormatSizes) => void;
}) {
  // Formats whose size is being typed in, and what's typed so far.
  const [custom, setCustom] = useState<Record<string, { w: string; h: string }>>({});
  const rows = formats.filter(hasSize);
  if (!rows.length) return null;

  const key = (s: FormatSize) => `${s.w}x${s.h}`;

  function set(fid: string, size: FormatSize | null) {
    const next = { ...value };
    const def = defaultSize(fid);
    if (!size || (def && key(def) === key(size))) delete next[fid];
    else next[fid] = size;
    onChange(next);
  }

  function choose(fid: string, choice: string) {
    if (choice === "custom") {
      const now = value[fid] ?? defaultSize(fid) ?? { w: 1080, h: 1080 };
      setCustom((c) => ({ ...c, [fid]: { w: String(now.w), h: String(now.h) } }));
      set(fid, now);
      return;
    }
    setCustom((c) => {
      const rest = { ...c };
      delete rest[fid];
      return rest;
    });
    if (choice === "own") return set(fid, null);
    const [w, h] = choice.split("x").map(Number);
    set(fid, { w, h });
  }

  function type(fid: string, side: "w" | "h", text: string) {
    const draft = { ...(custom[fid] ?? { w: "", h: "" }), [side]: text };
    setCustom((c) => ({ ...c, [fid]: draft }));
    const w = Number(draft.w);
    const h = Number(draft.h);
    const ok = (n: number) => Number.isInteger(n) && n >= 1 && n <= 20000;
    if (ok(w) && ok(h)) set(fid, { w, h });
  }

  return (
    <div className="field">
      <label htmlFor={`nbSize-${rows[0]}`}>
        Size <span className="hint">in pixels: the review shows the post at this shape</span>
      </label>
      <div className="sizerows">
        {rows.map((fid) => {
          const presets = sizePresets(fid);
          const chosen = value[fid] ?? null;
          const typing = !!custom[fid] || (!!chosen && !presets.some((p) => key(p) === key(chosen)));
          const selected = typing ? "custom" : chosen ? key(chosen) : presets[0] ? key(presets[0]) : "own";
          const label = formatById(fid)?.label ?? fid;
          const draft = custom[fid] ?? (chosen ? { w: String(chosen.w), h: String(chosen.h) } : { w: "", h: "" });
          return (
            <div className="sizerow" key={fid}>
              {rows.length > 1 && <span className="sizefmt">{label}</span>}
              <select
                id={`nbSize-${fid}`}
                aria-label={rows.length > 1 ? `${label} size` : "Size"}
                value={selected}
                onChange={(e) => choose(fid, e.target.value)}
              >
                {!presets.length && <option value="own">The artwork&rsquo;s own shape</option>}
                {presets.map((p, i) => (
                  <option key={key(p)} value={key(p)}>
                    {sizeLabel(p)}
                    {i === 0 ? " (default)" : ""}
                  </option>
                ))}
                <option value="custom">Custom size</option>
              </select>
              {typing && (
                <span className="sizecustom">
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={20000}
                    aria-label={`${label} width`}
                    value={draft.w}
                    onChange={(e) => type(fid, "w", e.target.value)}
                  />
                  <span aria-hidden="true">×</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={20000}
                    aria-label={`${label} height`}
                    value={draft.h}
                    onChange={(e) => type(fid, "h", e.target.value)}
                  />
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
