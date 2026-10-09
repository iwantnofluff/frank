"use client";

import { useEffect, useState } from "react";
import { SettingsHead } from "@/components/settings/SettingsHead";
import { CURRENT_RELEASE, RELEASES } from "@/lib/releases";
import { displayVersion } from "@/lib/release-version";
import { useMarkReleasesSeen } from "@/hooks/use-releases-seen";

// Settings → General → Updates (direct instruction): every version of Frank
// with what changed, newest first. The newest shows in full; earlier ones
// are links that open to their changes. Each has its own address
// (#v1-12-0), which the bell's notice opens. Opening the page reads every
// update so far.
const anchor = (v: string) => `v${v.replace(/\./g, "-")}`;
const day = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

export default function UpdatesPage() {
  const markSeen = useMarkReleasesSeen();
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    markSeen.mutate(CURRENT_RELEASE.version);
    // Opened at a version (from the bell): that one open.
    const hash = window.location.hash.slice(1);
    const hit = RELEASES.find((r) => anchor(r.version) === hash);
    if (!hit) return;
    requestAnimationFrame(() => {
      if (hit !== CURRENT_RELEASE) setOpen(hit.version);
      requestAnimationFrame(() => document.getElementById(hash)?.scrollIntoView({ block: "start" }));
    });
    // Once, as the page opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [latest, ...earlier] = RELEASES;
  return (
    <>
      <SettingsHead title="Updates" description={`What's new in Frank. You're on ${displayVersion(CURRENT_RELEASE.version)}.`} />
      <section className="panel rel" id={anchor(latest.version)}>
        <div className="panel-h">
          <b>
            {displayVersion(latest.version)} · {latest.title}
          </b>
          <span className="tag blue">Current</span>
          <span className="rel-date">{day(latest.date)}</span>
        </div>
        <ul className="rel-list">
          {latest.changes.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      </section>

      <section className="panel rel-earlier" aria-label="Earlier versions">
        <div className="panel-h">
          <b>Earlier versions</b>
          <span className="sync">{earlier.length}</span>
        </div>
        {earlier.map((r) => {
          const isOpen = open === r.version;
          return (
            <div className="rel-row" id={anchor(r.version)} key={r.version}>
              <button type="button" className="rel-link" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : r.version)}>
                <b>{displayVersion(r.version)}</b>
                <span className="rel-t">{r.title}</span>
                <span className="rel-date">{day(r.date)}</span>
              </button>
              {isOpen && (
                <ul className="rel-list">
                  {r.changes.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </section>
    </>
  );
}
