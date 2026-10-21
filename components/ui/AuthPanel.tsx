import type { ReactNode } from "react";
import { BRAND } from "@/lib/brand";

// Every sign-in screen, dressed as the website (direct instruction, 21 Oct
// 2026): its header with the Frank logo (no website links: an agency's
// clients sign in here too), a Sentient Light heading with a line under
// it, and the soft grey card holding the form or what to do next. The
// front door (app/welcome) wears the same, with the website's links.
// How long a heading reads, to step a long one down a size.
function textLength(node: ReactNode): number {
  if (typeof node === "string" || typeof node === "number") return String(node).length;
  if (Array.isArray(node)) return node.reduce((n: number, c) => n + textLength(c), 0);
  if (node && typeof node === "object" && "props" in node) return textLength((node.props as { children?: ReactNode }).children);
  return 0;
}

export function AuthPanel({
  title,
  sub,
  children,
  wide = false,
}: {
  title: ReactNode;
  sub?: ReactNode;
  // The form, or a button or link onward; no card when there's nothing.
  children?: ReactNode;
  // Wider, for reading (the privacy policy).
  wide?: boolean;
}) {
  return (
    <div className="fdoor">
      <header className="fd-head">
        <div className="fd-headin">
          <span className="fd-logo">
            {/* eslint-disable-next-line @next/next/no-img-element -- the brand's own SVG */}
            <img src={BRAND.headerStrapline} alt="Frank, faster approvals" />
          </span>
        </div>
      </header>
      <main className={`fd-main${wide ? " wide" : ""}`}>
        <h1 className={`fd-title${textLength(title) > 24 ? " long" : ""}`}>{title}</h1>
        {sub && <p className="fd-sub">{sub}</p>}
        {children && <div className="fd-card">{children}</div>}
      </main>
    </div>
  );
}
