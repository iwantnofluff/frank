"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { useMyAgency } from "@/hooks/use-my-agency";
import { useMyMembership } from "@/hooks/use-my-membership";
import { useMyProfile } from "@/hooks/use-my-profile";
import { usePhoneScreen } from "@/hooks/use-phone-screen";
import { useMarkTourSeen, useSampleTargets, useTourTargets, type TourTargets } from "@/hooks/use-tour";
import { isOwnerOrAbove } from "@/lib/roles";
import { errorMessage } from "@/lib/errors";
import {
  GUIDES,
  TOURS,
  TOUR_AUTO_OFF_KEY,
  TOUR_START_EVENT,
  setTouring,
  tourKind,
  type TourPlace,
  type TourStart,
  type TourStep,
} from "@/lib/tour";
import { HELP_ARTICLES } from "@/lib/help-content";

// How long to look for a step's place (a page loading, a table filling)
// before showing its card in the middle instead.
const WAIT_MS = 4000;
// Room around what's lit up, and between it and the card.
const PAD = 8;
const GAP = 14;
const EDGE = 16;

function pathFor(place: TourPlace, t: TourTargets, post: TourStep["post"] = "stages"): string | null {
  switch (place) {
    case "dashboard":
      return "/dashboard";
    case "client":
      return t.clientId ? `/clients/${t.clientId}` : null;
    case "client-settings":
      return t.clientId ? `/clients/${t.clientId}/settings/details` : null;
    case "client-knowledge":
      return t.clientId ? `/clients/${t.clientId}/settings/knowledge` : null;
    case "client-instagram":
      return t.clientId ? `/clients/${t.clientId}/settings/instagram` : null;
    case "client-preferences":
      return t.clientId ? `/clients/${t.clientId}/settings/preferences` : null;
    case "project":
      return t.projectId ? `/projects/${t.projectId}` : null;
    case "assets":
      return t.assetProjectId ? `/projects/${t.assetProjectId}` : null;
    case "analytics":
      return "/settings/analytics";
    case "settings":
      return "/settings/general";
    case "post":
      return t.posts ? `/creatives/${t.posts[post]}` : t.postId ? `/creatives/${t.postId}` : null;
    case "team":
      return "/settings/team";
    default:
      return null;
  }
}

// A step whose page there's nothing for yet (no client, project or post)
// is left out, as is inviting for someone who can't.
function available(step: TourStep, t: TourTargets, canInvite: boolean) {
  if (step.invites && !canInvite) return false;
  return step.place === "here" || pathFor(step.place, t, step.post) !== null;
}

// A step's spot or open: a selector, or "text=<css>|<words>" for the first
// <css> whose text starts with <words>. Only what's on screen counts.
function findEl(sel: string, t?: TourTargets | null): HTMLElement | null {
  // The sample's own ids, in place of {client}, {project}, {assets} and
  // {post:<which>}.
  if (t) {
    sel = sel
      .replaceAll("{client}", t.clientId ?? "")
      .replaceAll("{project}", t.projectId ?? "")
      .replaceAll("{assets}", t.assetProjectId ?? "")
      .replace(/\{post:(\w+)\}/g, (_, k: "stages" | "comments" | "concept") => t.posts?.[k] ?? t.postId ?? "");
  }
  let list: HTMLElement[];
  if (sel.startsWith("text=")) {
    const [css, words] = sel.slice(5).split("|");
    list = [...document.querySelectorAll<HTMLElement>(css)].filter((e) => (e.textContent ?? "").trim().startsWith(words));
  } else {
    list = [...document.querySelectorAll<HTMLElement>(sel)];
  }
  // Never the tour's own card.
  return list.find((e) => e.getClientRects().length && !e.closest(".tour")) ?? null;
}

// Closes a window the tour opened, as Escape would (the tour's own Escape
// handler only takes real key presses).
function closeWindow() {
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
}

// Help's Show Me (phase147): a topic's walkthrough, or a category's topics'
// back to back.
function guideSteps(start: TourStart): TourStep[] {
  if (start.guide) return GUIDES[start.guide] ?? [];
  if (start.category) {
    const all = HELP_ARTICLES.filter((a) => a.category === start.category).flatMap((a) => GUIDES[a.id] ?? []);
    // A step the same as the one before it, once.
    return all.filter((st, i) => i === 0 || all[i - 1].id !== st.id);
  }
  return [];
}

// On the step's page: that page exactly, or for Settings and Team, any page
// under it (they open on their first section).
function onPage(pathname: string, path: string | null, place: TourPlace) {
  if (!path || pathname === path) return true;
  return (place === "team" || place === "settings") && pathname.startsWith(`${path}/`);
}

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

// Frank Tour (phase144, direct instruction): the page dimmed but for one
// thing at a time, a card beside it, Next to move on. Starts on its own on
// someone's first visit (desktop only), or from Frank Tour in the menu.
export function FrankTour() {
  const router = useRouter();
  const pathname = usePathname();
  const phone = usePhoneScreen();
  const { data: agency } = useMyAgency();
  const { data: membership } = useMyMembership(agency?.agencyId);
  const kind = tourKind(membership?.role, membership?.client_id);
  const canInvite = isOwnerOrAbove(membership?.role) || !!membership?.can_invite;
  const { data: profile } = useMyProfile();
  const mark = useMarkTourSeen();

  const [running, setRunning] = useState(false);
  // Frank Tour itself, or a Show Me's topic or category.
  const [show, setShow] = useState<TourStart | null>(null);
  const [index, setIndex] = useState(0);
  // Each move to a step, so going Back looks for its place afresh.
  const [visit, setVisit] = useState(0);
  // The team's tours use the sample client, got ready first; a client
  // reviewer's, their own work.
  const [run, setRun] = useState(0);
  const sample = useSampleTargets(agency?.agencyId, run, running && !!kind && kind !== "client");
  const own = useTourTargets(running && kind === "client");
  const targets = kind === "client" ? own.data : sample.data;

  // From the menu, any time.
  useEffect(() => {
    function onStart(e: Event) {
      const detail = (e as CustomEvent<TourStart | undefined>).detail;
      setShow(detail?.guide || detail?.category ? detail : null);
      setIndex(0);
      setRun((r) => r + 1);
      setRunning(true);
    }
    window.addEventListener(TOUR_START_EVENT, onStart);
    return () => window.removeEventListener(TOUR_START_EVENT, onStart);
  }, []);

  // On its own, once: someone who hasn't seen it, on a computer.
  const [autoChecked, setAutoChecked] = useState(false);
  if (!autoChecked && profile && kind && !phone) {
    setAutoChecked(true);
    let off = false;
    try {
      off = window.localStorage.getItem(TOUR_AUTO_OFF_KEY) === "1";
    } catch {
      // No storage: it may start.
    }
    if (!profile.tour_seen_at && !off) {
      setIndex(0);
      setRun((r) => r + 1);
      setRunning(true);
    }
  }

  // Seen as soon as it starts, so a reload doesn't bring it back.
  const { mutate: markSeen } = mark;
  const unseen = !!profile && !profile.tour_seen_at;
  useEffect(() => {
    if (running && unseen) markSeen();
  }, [running, unseen, markSeen]);

  useEffect(() => {
    setTouring(running);
  }, [running]);
  useEffect(() => () => setTouring(false), []);

  const steps = useMemo(
    () =>
      kind && targets
        ? (show && kind !== "client" ? guideSteps(show) : TOURS[kind]).filter((s) => available(s, targets, canInvite))
        : [],
    [kind, targets, canInvite, show],
  );
  const step = running ? (steps[index] ?? null) : null;
  const path = step && targets ? pathFor(step.place, targets, step.post) : null;
  const here = step ? onPage(pathname, path, step.place) : false;

  // To the step's page.
  useEffect(() => {
    if (step && path && !here) router.push(path);
  }, [step, path, here, router]);

  // Its place, once the page shows it; the card alone in the middle if it
  // doesn't appear.
  const stepId = step?.id ?? null;
  const lookKey = step && here ? `${visit}|${step.id}|${pathname}` : null;
  const [found, setFound] = useState<{ key: string; el: HTMLElement | null } | null>(null);
  const spotless = !!step && here && !step.spot?.length && !step.open?.length;
  const ready = spotless || (!!lookKey && found?.key === lookKey);
  const target = !spotless && lookKey && found?.key === lookKey ? found.el : null;
  // A window a step opened (Show Me), by the page and what was clicked, so
  // the next step needing the same one finds it still open.
  const opened = useRef<string | null>(null);
  useEffect(() => {
    if (!step || !lookKey) return;
    const want = step.open?.length ? `${pathname}|${step.open.join("|")}` : null;
    if (opened.current && opened.current !== want) {
      if (opened.current.startsWith(`${pathname}|`)) closeWindow();
      opened.current = null;
    }
    const toOpen = want && opened.current !== want ? [...step.open!] : [];
    if (want) opened.current = want;
    const spot = step.spot ?? [];
    const started = Date.now();
    const look = setInterval(() => {
      // Open what the step needs first, one click at a time as each appears.
      if (toOpen.length) {
        const el = findEl(toOpen[0], targets);
        if (el) {
          el.click();
          toOpen.shift();
        } else if (Date.now() - started > WAIT_MS) toOpen.length = 0;
        return;
      }
      if (!spot.length) {
        clearInterval(look);
        setFound({ key: lookKey, el: null });
        return;
      }
      const el = spot.map((sel) => findEl(sel, targets)).find(Boolean) ?? null;
      if (!el && Date.now() - started < WAIT_MS + 2000) return;
      clearInterval(look);
      el?.scrollIntoView({ block: "center", inline: "nearest" });
      setFound({ key: lookKey, el });
    }, 120);
    return () => clearInterval(look);
    // Once per step and page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lookKey]);

  // Follows it as the page settles or the window changes.
  const [tracked, setTracked] = useState<{ el: HTMLElement; box: Box } | null>(null);
  const box = target && tracked?.el === target ? tracked.box : null;
  useEffect(() => {
    if (!target) return;
    let frame = 0;
    let last = "";
    const track = () => {
      const r = target.getBoundingClientRect();
      const next = { top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 };
      const key = `${next.top}|${next.left}|${next.width}|${next.height}`;
      if (key !== last) {
        last = key;
        setTracked({ el: target, box: next });
      }
      frame = requestAnimationFrame(track);
    };
    frame = requestAnimationFrame(track);
    return () => cancelAnimationFrame(frame);
  }, [target]);

  // The card beside it: below, above, right or left, whichever fits.
  const card = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  useLayoutEffect(() => {
    const el = card.current;
    if (!el || !ready) {
      setPos(null);
      return;
    }
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(v, hi));
    if (!box) {
      // Its place found but not yet measured: wait a frame (the card stays
      // hidden till then), not jump.
      if (!target) setPos({ top: (vh - h) / 2, left: (vw - w) / 2 });
      return;
    }
    const centredX = clamp(box.left + box.width / 2 - w / 2, EDGE, vw - w - EDGE);
    const centredY = clamp(box.top + box.height / 2 - h / 2, EDGE, vh - h - EDGE);
    if (box.top + box.height + GAP + h <= vh - EDGE) setPos({ top: box.top + box.height + GAP, left: centredX });
    else if (box.top - GAP - h >= EDGE) setPos({ top: box.top - GAP - h, left: centredX });
    else if (box.left + box.width + GAP + w <= vw - EDGE) setPos({ top: centredY, left: box.left + box.width + GAP });
    else if (box.left - GAP - w >= EDGE) setPos({ top: centredY, left: box.left - GAP - w });
    else setPos({ top: vh - h - EDGE, left: centredX });
  }, [box, ready, stepId, target]);

  const next = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (ready) next.current?.focus({ preventScroll: true });
  }, [ready, stepId]);

  const last = index >= steps.length - 1;
  // Moving on: a window opened for this step is closed now, unless the
  // next step needs the same one on the same page.
  function leaveFor(to: number) {
    const nxt = steps[to];
    const nxtPath = nxt && targets ? pathFor(nxt.place, targets, nxt.post) : null;
    const stays = !!nxt && (!nxtPath || nxtPath === path) && nxt.open?.join("|") === step?.open?.join("|");
    if (opened.current && !stays) {
      closeWindow();
      opened.current = null;
    }
  }
  function end() {
    if (opened.current) closeWindow();
    opened.current = null;
    setRunning(false);
    setIndex(0);
  }
  function forward() {
    if (last) end();
    else {
      leaveFor(index + 1);
      setIndex((i) => i + 1);
      setVisit((v) => v + 1);
    }
  }
  function back() {
    leaveFor(Math.max(0, index - 1));
    setIndex((i) => Math.max(0, i - 1));
    setVisit((v) => v + 1);
  }

  useEffect(() => {
    if (!running) return;
    function onKey(e: KeyboardEvent) {
      // The tour's own closing of a window (closeWindow), not a key press.
      if (!e.isTrusted) return;
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        end();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        forward();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        back();
      }
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  if (!running || typeof document === "undefined") return null;

  return createPortal(
    <div className="tour" data-lit={box ? "true" : "false"}>
      {/* Takes every click: the page waits while the tour runs. */}
      <div className="tour-scrim" onClick={(e) => e.stopPropagation()} />
      {box && <div className="tour-hole" style={{ top: box.top, left: box.left, width: box.width, height: box.height }} />}
      {/* The sample client being got ready (made or reset the first time,
          a few seconds), or why it couldn't be: never a tour of anything
          else. */}
      {kind !== "client" && !targets && (
        <div className="tour-card" role="dialog" aria-modal="true" aria-labelledby="tourWait" style={{ top: "40%", left: "50%", transform: "translate(-50%, -50%)" }}>
          <h2 id="tourWait">
            {sample.error ? `${show ? "Show Me" : "Frank Tour"} couldn’t start` : `Getting ${show ? "it" : "Frank Tour"} ready…`}
          </h2>
          <p>
            {sample.error
              ? errorMessage(sample.error, "Couldn't get the sample client ready")
              : "It uses Lumen Skin, your sample client. This takes a moment the first time."}
          </p>
          <div className="tour-f">
            <span className="grow" />
            <button type="button" className="btn sm" onClick={end}>
              {sample.error ? "Close" : "Skip Tour"}
            </button>
          </div>
        </div>
      )}
      {step && ready && (
        <div
          ref={card}
          className="tour-card"
          role="dialog"
          aria-modal="true"
          aria-labelledby="tourTitle"
          aria-describedby="tourBody"
          style={pos && (box || !target) ? { top: pos.top, left: pos.left } : { visibility: "hidden" }}
        >
          <div className="tour-n">
            {index + 1} of {steps.length}
          </div>
          <h2 id="tourTitle">{step.title}</h2>
          <p id="tourBody">{step.body}</p>
          <div className="tour-f">
            {!last && (
              <button type="button" className="tour-skip" onClick={end}>
                {show ? "Stop" : "Skip Tour"}
              </button>
            )}
            <span className="grow" />
            {index > 0 && (
              <button type="button" className="btn sm" onClick={back}>
                Back
              </button>
            )}
            <button ref={next} type="button" className="btn sm primary" onClick={forward}>
              {last ? "Done" : "Next"}
            </button>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}
