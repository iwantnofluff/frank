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
import { forgetSignedUrls } from "@/hooks/use-avatar-urls";

// Your picture at the top right of the header (direct instruction, moved
// from the foot of the rail): My Profile, Settings for the agency's team
// (moved here from the agency's mark), then Sign out after a divider. The
// same .colpop/.cpr shell RowActionsMenu uses, opening below it.
export function AccountMenu({
  initials,
  name,
  email,
  showSettings,
}: {
  initials: string;
  name: string | null;
  email: string;
  // Settings is the agency's team's, not a client's people's.
  showSettings: boolean;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  // Opens and closes with motion (hooks/use-presence.ts).
  const pop = usePresence(anchor);
  const [signingOut, setSigningOut] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { data: profile, isPending: profilePending } = useMyProfile();
  const { data: photos } = useAvatarUrls([profile?.avatar_asset_id]);
  const photoUrl = profile?.avatar_asset_id ? photos?.[profile.avatar_asset_id] : undefined;
  useViewportFit(ref, pop.shown, { side: "below", gap: 6, align: "end" });

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
    forgetSignedUrls();
    // Nothing from this session may be shown to whoever signs in next.
    queryClient.clear();
    router.push("/login");
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        className="avatar topavatar"
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
        ) : profilePending || profile?.avatar_asset_id ? null : (
          // Initials only when there's no photo, never before one arrives
          // (direct instruction: no flashing in).
          initials
        )}
      </button>
      {pop.shown && (
        <div className={`colpop on motion${pop.isOpen ? " is-open" : ""}`} ref={ref} role="menu" aria-label="Your account" style={{ width: 240 }}>
          <div className="cp-b" style={{ padding: "4px 4px" }}>
            <div style={{ padding: "8px 8px 10px", borderBottom: "1px solid var(--line)", marginBottom: 4 }}>
              {(profile?.name ?? name) && (
                <div style={{ fontSize: 14.2, fontWeight: 600 }}>{profile?.name ?? name}</div>
              )}
              {profile?.designation && (
                <div style={{ fontSize: 13.2, marginTop: 1 }}>{profile.designation}</div>
              )}
              <div style={{ fontSize: 13.2, color: "var(--muted)", overflowWrap: "anywhere", marginTop: 2 }}>
                {email}
              </div>
            </div>
            <Link href="/profile" role="menuitem" className="cpr" onClick={() => setAnchor(null)}>
              <span className="cn">My Profile</span>
            </Link>
            {showSettings && (
              <Link href="/settings" role="menuitem" className="cpr" onClick={() => setAnchor(null)}>
                <span className="cn">Settings</span>
              </Link>
            )}
            <div className="menusep" role="separator" />
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
