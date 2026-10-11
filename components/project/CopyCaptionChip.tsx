"use client";

import { useState } from "react";
import { copyCaption } from "@/lib/copy-text";

// The table's Copy Caption and Copy WIIFM (direct instruction): pill-sized,
// at the end of a cell's text, copying it with its line breaks and
// paragraphs (lib/copy-text). Its click stays here: the row under it opens
// the post.
export function CopyCaptionChip({
  caption,
  label = "Copy Caption",
  title = "Copy the caption, paragraphs and all",
}: {
  caption: string;
  label?: string;
  title?: string;
}) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  return (
    <button
      type="button"
      className="copychip"
      title={title}
      onClick={async (e) => {
        e.stopPropagation();
        try {
          await copyCaption(caption);
          setState("copied");
        } catch {
          setState("failed");
        }
        window.setTimeout(() => setState("idle"), 2000);
      }}
    >
      {state === "copied" ? "Copied" : state === "failed" ? "Couldn’t copy" : label}
    </button>
  );
}
