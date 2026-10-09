"use client";

import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Modal } from "@/components/ui/Modal";
import { useReviewViewer } from "@/hooks/use-review-viewer";

// A link from a review link into Frank (direct instruction): signed in, it
// opens as any link; signed out (or with no account), a window asks them
// to sign in first, and brings them back to where they were going.
export function GatedLink({
  href,
  what,
  workspaceName,
  className,
  children,
}: {
  href: string;
  // What it opens, for the window: "No Fluff".
  what: string;
  workspaceName: string;
  className?: string;
  children: ReactNode;
}) {
  const { data: viewer } = useReviewViewer();
  const [asking, setAsking] = useState(false);
  return (
    <>
      <a
        href={href}
        className={`rv-link${className ? ` ${className}` : ""}`}
        onClick={(e) => {
          if (viewer?.signedIn) return;
          e.preventDefault();
          setAsking(true);
        }}
      >
        {children}
      </a>
      {/* Over the whole page, not inside the panel it was opened from. */}
      {asking &&
        createPortal(
          <Modal
            hideCloseButton
            size="sm"
            title="Sign in to Frank"
            onClose={() => setAsking(false)}
            footer={
              <>
                <button
                  type="button"
                  className="btn"
                  onClick={() => setAsking(false)}
                >
                  Cancel
                </button>
                <a
                  className="btn primary"
                  href={`/login?redirect_to=${encodeURIComponent(href)}`}
                >
                  Sign In
                </a>
              </>
            }
          >
            <p className="sub">To open {what} in Frank, sign in.</p>
            <p className="sub" style={{ marginTop: 8 }}>
              No account yet? Ask {workspaceName} to invite you.
            </p>
          </Modal>,
          document.body,
        )}
    </>
  );
}
