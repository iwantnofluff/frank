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
import { useMyWorkspaces } from "@/hooks/use-my-workspaces";

// Your picture at the top right of the header (direct instruction, moved
// from the foot of the rail): My Profile, Settings for the agency's team
// (moved here from the agency's mark), then Sign out after a divider. The
// same .colpop/.cpr shell RowActionsMenu uses, opening below it. With more
// than one workspace, a switcher between them (direct instruction, like
// Slack): one sign-in covers them all (lib/tenant.ts).
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
  const { data: mine } = useMyWorkspaces(true);
  const workspaces = mine?.switchable && mine.workspaces.length > 1 ? mine.workspaces : [];

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
            {workspaces.length > 0 && (
              <>
                <div className="ws-h">Workspaces</div>
                {workspaces.map((w) =>
                  w.current ? (
                    <div key={w.id} className="cpr ws-row" role="menuitem" aria-current="true" aria-disabled="true">
                      <WorkspaceMark name={w.name} logoUrl={w.logoUrl} />
                      <span className="cn">{w.name}</span>
                      <svg className="ws-tick" viewBox="0 0 24 24" aria-label="Current workspace">
                        <path d="M5 12.5l4.5 4.5L19 7.5" />
                      </svg>
                    </div>
                  ) : (
                    <a key={w.id} href={`${w.url}/dashboard`} role="menuitem" className="cpr ws-row">
                      <WorkspaceMark name={w.name} logoUrl={w.logoUrl} />
                      <span className="cn">{w.name}</span>
                      {w.paused && <span className="ws-paused">Paused</span>}
                    </a>
                  ),
                )}
                <div className="menusep" role="separator" />
              </>
            )}
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

// A workspace's logo, or its initial without one.
function WorkspaceMark({ name, logoUrl }: { name: string; logoUrl: string | null }) {
  return logoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element -- short-lived signed storage URL
    <img className="ws-mark" src={logoUrl} alt="" />
  ) : (
    <span className="ws-mark ws-initial" aria-hidden="true">
      {name.trim().charAt(0).toUpperCase() || "W"}
    </span>
  );
}
