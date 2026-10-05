"use client";

import { useEffect, useRef, useState } from "react";
import { usePresence } from "@/hooks/use-presence";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useViewportFit } from "@/hooks/use-viewport-fit";
import { useMyProfile } from "@/hooks/use-my-profile";
import { useAvatarUrls } from "@/hooks/use-avatar-urls";

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
  // Opens and closes with motion (hooks/use-presence.ts).
  const pop = usePresence(anchor);
  const [signingOut, setSigningOut] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { data: profile } = useMyProfile();
  const { data: photos } = useAvatarUrls([profile?.avatar_asset_id]);
  const photoUrl = profile?.avatar_asset_id ? photos?.[profile.avatar_asset_id] : undefined;
  useViewportFit(ref, pop.shown, { side: "beside", gap: 10 });

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
        style={photoUrl ? { overflow: "hidden" } : undefined}
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          setAnchor((prev) => (prev ? null : rect));
        }}
      >
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- short-lived signed storage URL
          <img src={photoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          initials
        )}
      </button>
      {pop.shown && (
        <div className={`colpop on motion${pop.isOpen ? " is-open" : ""}`} ref={ref} role="menu" aria-label="Your account" style={{ width: 240 }}>
          <div className="cp-b" style={{ padding: "4px 4px" }}>
            <div style={{ padding: "8px 8px 10px", borderBottom: "1px solid var(--line)", marginBottom: 4 }}>
              {(profile?.name ?? name) && (
                <div style={{ fontSize: 14, fontWeight: 600 }}>{profile?.name ?? name}</div>
              )}
              {profile?.designation && (
                <div style={{ fontSize: 13, marginTop: 1 }}>{profile.designation}</div>
              )}
              <div style={{ fontSize: 13, color: "var(--muted)", overflowWrap: "anywhere", marginTop: 2 }}>
                {email}
              </div>
            </div>
            <Link href="/profile" role="menuitem" className="cpr" onClick={() => setAnchor(null)}>
              <span className="cn">Your Profile</span>
            </Link>
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
