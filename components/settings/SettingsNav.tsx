"use client";

import { useState } from "react";
import Link from "next/link";
import { usePresence } from "@/hooks/use-presence";
import { NAV_ICONS, NAV_ICON_STROKE, NAV_ICON_VIEWBOX } from "@/lib/nav-icons";
import { SETTINGS_SECTIONS, settingsPageFor, type SettingsSection } from "@/lib/settings-nav";

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
// The admin area (admin.beingfrank.app) uses the same menu with its own
// sections (lib/admin/admin-nav.ts).
export function SettingsNav({
  pathname,
  sections = SETTINGS_SECTIONS,
  label = "Settings sections",
}: {
  pathname: string;
  sections?: SettingsSection[];
  label?: string;
}) {
  const current = settingsPageFor(pathname, sections);
  const [collapsed, setCollapsed] = useState(false);
  const [open, setOpen] = useState<string | null>(current?.section.key ?? null);
  // Arriving in another section (a link, the back button) opens it instead.
  const [openedFor, setOpenedFor] = useState(current?.section.key);
  if (current && openedFor !== current.section.key) {
    setOpenedFor(current.section.key);
    setOpen(current.section.key);
  }

  if (sections.every((s) => s.icon)) {
    return (
      <IconicNav
        sections={sections}
        label={label}
        current={current?.page.href ?? null}
        open={open}
        onToggle={(key) => setOpen((o) => (o === key ? null : key))}
        collapsed={collapsed}
        onCollapse={() => setCollapsed((c) => !c)}
      />
    );
  }

  return (
    <nav className={`setnav${collapsed ? " collapsed" : ""}`} aria-label={label}>
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
          {sections.map((section) => {
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

// A menu whose every section has an icon (direct instruction: like the
// review page's section menu). Open, each section is its icon and name,
// with its pages under it; closed, the icons alone, and the open section's
// pages as dots in the same rows, so nothing moves. Every row is a fixed
// height either way. The names ease in and out (hooks/use-presence.ts);
// the column is as wide as it needs, 20px past the longest name.
function IconicNav({
  sections,
  label,
  current,
  open,
  onToggle,
  collapsed,
  onCollapse,
}: {
  sections: SettingsSection[];
  label: string;
  current: string | null;
  open: string | null;
  onToggle: (key: string) => void;
  collapsed: boolean;
  onCollapse: () => void;
}) {
  const names = usePresence(!collapsed);
  const fade = (className = "") => `rn-label${className}${names.isOpen ? " is-open" : ""}`;
  return (
    <nav className={`setnav iconic${names.shown ? " named" : ""}`} aria-label={label}>
      <button
        type="button"
        className="reviewnav-toggle"
        onClick={onCollapse}
        title={collapsed ? "Show section names" : "Hide section names"}
        aria-label={collapsed ? "Show section names" : "Hide section names"}
        aria-expanded={!collapsed}
      >
        <Chevron d={collapsed ? "M9 18l6-6-6-6" : "M15 18l-6-6 6-6"} />
      </button>
      <div className="setnav-list">
        {sections.map((section) => {
          const isOpen = open === section.key;
          return (
            <div key={section.key} className="setnav-sec">
              <button
                type="button"
                className="setnav-h"
                aria-expanded={isOpen}
                aria-label={section.label}
                title={collapsed ? section.label : undefined}
                onClick={() => onToggle(section.key)}
              >
                <svg
                  className="rn-ic"
                  viewBox={NAV_ICON_VIEWBOX[section.icon!]}
                  style={{ strokeWidth: NAV_ICON_STROKE[section.icon!] }}
                  aria-hidden="true"
                >
                  {NAV_ICONS[section.icon!].map((d) => (
                    <path key={d} d={d} />
                  ))}
                </svg>
                {names.shown && <span className={fade(" setnav-name")}>{section.label}</span>}
                {names.shown && (
                  <span className={fade(" setnav-chev")}>
                    <Chevron d={isOpen ? "M18 15l-6-6-6 6" : "M6 9l6 6 6-6"} />
                  </span>
                )}
              </button>
              {isOpen && (
                <div className="setnav-pages">
                  {section.pages.map((page) => (
                    <Link
                      key={page.href}
                      href={page.href}
                      className="reviewnav-item setnav-item"
                      aria-current={current === page.href}
                      aria-label={page.label}
                      title={collapsed ? page.label : undefined}
                    >
                      <span className="setnav-dot" aria-hidden="true">
                        {collapsed && <i />}
                      </span>
                      {names.shown && (
                        <span className={fade(" setnav-name")}>
                          {page.label}
                          {page.soon && <span className="setnav-soon">Soon</span>}
                        </span>
                      )}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </nav>
  );
}

