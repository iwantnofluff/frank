"use client";

import { useEffect } from "react";

// Back from a post's page (direct instruction): its row in the table (or
// its card on a phone), [data-post=id], brought to the middle of the view
// and lit for a moment, so nobody has to scroll to find it. Tried each
// frame for up to two seconds while the table draws; a row the filters
// hide is never found, and nothing moves.
export function useFocusRow(postId: string | null | undefined) {
  useEffect(() => {
    if (!postId) return;
    let frame = 0;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const find = () => {
      const row = document.querySelector<HTMLElement>(`[data-post="${CSS.escape(postId)}"]`);
      if (!row) {
        if (++tries < 120) frame = requestAnimationFrame(find);
        return;
      }
      row.scrollIntoView({ block: "center" });
      row.classList.add("rowflash");
      timer = setTimeout(() => row.classList.remove("rowflash"), 2400);
    };
    find();
    return () => {
      cancelAnimationFrame(frame);
      if (timer) clearTimeout(timer);
    };
  }, [postId]);
}
