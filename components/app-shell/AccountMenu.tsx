"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useViewportFit } from "@/hooks/use-viewport-fit";

// The prototype's avatar only jumped to Settings and had no way to sign
// out; this is the same .colpop/.cpr shell RowActionsMenu uses, opening
// beside the avatar at the foot of the rail.
export function AccountMenu({
  initials,
  name,
  email,
}: {
  initials: string;
  name: string | null;
  email: string;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useViewportFit(ref, anchor, { side: "beside", gap: 10 });

  useEffect(() => {
    if (!anchor) return;
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAnchor(null);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setAnchor(null);
    }
    document.addEventListener("mousedown", onMouseDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [anchor]);

  async function signOut() {
    setSigningOut(true);
    await createClient().auth.signOut();
    // Nothing from this session may be shown to whoever signs in next.
    queryClient.clear();
    router.push("/login");
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        className="avatar"
        title="Your account"
        aria-label="Your account"
        aria-haspopup="menu"
        aria-expanded={!!anchor}
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          setAnchor((prev) => (prev ? null : rect));
        }}
      >
        {initials}
      </button>
      {anchor && (
        <div className="colpop on" ref={ref} role="menu" aria-label="Your account" style={{ width: 240 }}>
          <div className="cp-b" style={{ padding: "4px 4px" }}>
            <div style={{ padding: "8px 8px 10px", borderBottom: "1px solid var(--line)", marginBottom: 4 }}>
              {name && <div style={{ fontSize: 14, fontWeight: 600 }}>{name}</div>}
              <div style={{ fontSize: 13, color: "var(--muted)", overflowWrap: "anywhere" }}>{email}</div>
            </div>
            <button
              type="button"
              role="menuitem"
              className="cpr"
              disabled={signingOut}
              onClick={signOut}
            >
              <span className="cn">{signingOut ? "Signing out…" : "Sign out"}</span>
            </button>
          </div>
        </div>
      )}
    </>
  );
}
