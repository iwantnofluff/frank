"use client";

import { useState } from "react";
import Link from "next/link";
import { SETTINGS_SECTIONS, settingsPageFor } from "@/lib/settings-nav";

function Chevron({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24">
      <path d={d} />
    </svg>
  );
}

// Settings' left panel (direct instruction: monday's admin layout, with the
// review page's collapsing panel as the reference). Sections open and close
// like monday's, one at a time; the one you're in opens by itself. The whole panel
// collapses to a strip with the same toggle as the review page's
// (ReviewNav's .reviewnav-toggle).
export function SettingsNav({ pathname }: { pathname: string }) {
  const current = settingsPageFor(pathname);
  const [collapsed, setCollapsed] = useState(false);
  const [open, setOpen] = useState<string | null>(current?.section.key ?? null);
  // Arriving in another section (a link, the back button) opens it instead.
  const [openedFor, setOpenedFor] = useState(current?.section.key);
  if (current && openedFor !== current.section.key) {
    setOpenedFor(current.section.key);
    setOpen(current.section.key);
  }

  return (
    <nav className={`setnav${collapsed ? " collapsed" : ""}`} aria-label="Settings sections">
      <button
        type="button"
        className="reviewnav-toggle"
        onClick={() => setCollapsed((c) => !c)}
        title={collapsed ? "Show settings menu" : "Hide settings menu"}
        aria-label={collapsed ? "Show settings menu" : "Hide settings menu"}
      >
        <Chevron d={collapsed ? "M9 18l6-6-6-6" : "M15 18l-6-6 6-6"} />
      </button>
      {!collapsed && (
        <div className="setnav-list">
          {SETTINGS_SECTIONS.map((section) => {
            const isOpen = open === section.key;
            return (
              <div key={section.key} className="setnav-sec">
                <button
                  type="button"
                  className="setnav-h"
                  aria-expanded={isOpen}
                  onClick={() => setOpen((o) => (o === section.key ? null : section.key))}
                >
                  {section.label}
                  <Chevron d={isOpen ? "M18 15l-6-6-6 6" : "M6 9l6 6 6-6"} />
                </button>
                {isOpen && (
                  <div className="setnav-pages">
                    {section.pages.map((page) => (
                      <Link
                        key={page.href}
                        href={page.href}
                        className="reviewnav-item setnav-item"
                        aria-current={current?.page.href === page.href}
                      >
                        {page.label}
                        {page.soon && <span className="setnav-soon">Soon</span>}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </nav>
  );
}
