"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { CreativeListRow } from "@/hooks/use-creatives";
import type { CustomColumnRow } from "@/hooks/use-custom-columns";
import { CxCell } from "@/components/project/CxCell";
import { ProjectCalendarGrid } from "@/components/project/ProjectCalendarGrid";
import { ColumnsPopover, type ToggleableColumn } from "@/components/project/ColumnsPopover";
import { CreativePreviewPopover } from "@/components/project/CreativePreviewPopover";
import { CopyVersionHistoryPopover } from "@/components/project/CopyVersionHistoryPopover";
import { SaveViewModal } from "@/components/project/SaveViewModal";
import { bandOf, stageLabel, stageColor, exceptionLabel, type Band } from "@/lib/stage-labels";
import { errorMessage } from "@/lib/errors";
import { formatById } from "@/lib/formats";
import { platformColor } from "@/lib/platform-colors";
import { getMonthWeeks, getWeekDays, isoWeekNumber, dateKey } from "@/lib/calendar-weeks";
import { useCopyVersionsByCreative, type CopyVersionSummary } from "@/hooks/use-copy-versions-by-creative";
import { useLatestFeedbackByCreative } from "@/hooks/use-latest-feedback-by-creative";
import { useMyAgency } from "@/hooks/use-my-agency";
import {
  useCalendarViews,
  useCreateCalendarView,
  useUpdateCalendarView,
  useDeleteCalendarView,
  type CalendarViewRow,
} from "@/hooks/use-calendar-views";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const MONTH_ABBR = MONTH_NAMES.map((m) => m.slice(0, 3));
const DAY_ABBR = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type ViewMode = "week" | "month" | "calendar";

const STATUS_FILTERS: { value: "all" | Band; label: string }[] = [
  { value: "all", label: "All Statuses" },
  { value: "internal", label: "In Production" },
  { value: "review", label: "Client Review" },
  { value: "changes_requested", label: "Changes Requested" },
  { value: "rejected", label: "Rejected" },
  { value: "approved", label: "Approved" },
];

// Week/Date/Day are frozen — always shown, always sticky (left offsets
// below match their fixed widths) — not offered in the Columns picker.
const FROZEN_COLUMNS = [
  { key: "week", label: "Week", sub: "No.", width: 66, stickyClass: "sk1", left: 0 },
  { key: "date", label: "Date", sub: "Of post", width: 92, stickyClass: "sk2", left: 66 },
  { key: "day", label: "Day", sub: "Of week", width: 64, stickyClass: "sk3", left: 158 },
] as const;

// Matches the real content-planner template used on live client work
// (Hapi Dental's Sep '26 planner, not frank-prototype.html's fictional
// demo data) — labels, sub-labels and order all read off that sheet.
const TOGGLABLE_COLUMNS = [
  { key: "time", label: "Time", sub: "Time of Post", width: 74 },
  { key: "status", label: "Status", sub: "Status of Post", width: 156 },
  { key: "type", label: "Post Type", sub: "Suggested Type", width: 134 },
  { key: "lead", label: "Lead", sub: "POC in Team", width: 112 },
  { key: "platform", label: "Platform", sub: "Which Platforms", width: 132 },
  { key: "creative", label: "Asset Name/Link", sub: "Latest Post Visual", width: 196 },
  { key: "concept", label: "Concept", sub: "Describe the Post or Add Ref Link", width: 236 },
  // One column each, not three (1/2/3) — the cell shows the latest
  // copy_versions row; older ones show on hover instead of their own
  // columns (CopyVersionHistoryPopover), per explicit direction.
  { key: "imageOnText", label: "Image on Text", sub: "Check WIIFM Approach", width: 220 },
  { key: "postCopy", label: "Post Copy", sub: "Check WIIFM Approach", width: 220 },
  { key: "approach", label: "Approach Notes", sub: "Explain the WIIFM Approach", width: 236 },
  { key: "clientFeedback", label: "Client Feedback", sub: "", width: 220 },
] as const;

const CUSTOM_COLUMN_WIDTH = 140;
const DEFAULT_COLUMN_ORDER = TOGGLABLE_COLUMNS.map((c) => c.key);

function timeOf(dt: Date) {
  return `${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`;
}

// A saved (or default) order can be missing a key that exists right now —
// a custom column added since the view was saved, say — and can carry a
// key that no longer exists (a custom column since deleted, or a project
// with no custom columns using a view saved on one that has some). Known
// keys keep the saved order; anything missing is appended at the end, so
// the raw stored/default order can stay exactly what was saved/is-default
// without a sync effect reconciling it.
function resolveOrder(order: string[], allKeys: string[]): string[] {
  const known = new Set(allKeys);
  const resolved = order.filter((k) => known.has(k));
  const missing = allKeys.filter((k) => !resolved.includes(k));
  return [...resolved, ...missing];
}

function hiddenListFromVisibility(visibility: Record<string, boolean>): string[] {
  return Object.keys(visibility)
    .filter((k) => visibility[k] === false)
    .sort();
}

function sameStringArray(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

function sameWidths(a: Record<string, number>, b: Record<string, number>): boolean {
  const aKeys = Object.keys(a).sort();
  const bKeys = Object.keys(b).sort();
  if (!sameStringArray(aKeys, bKeys)) return false;
  return aKeys.every((k) => a[k] === b[k]);
}

// Ports frank-prototype.html's v-calendar toolbar and Week/Month table
// views (renderList()/renderWeek()/tableRows()); "Calendar" mode delegates
// to ProjectCalendarGrid. Scoped to one project (no cross-project
// selector), no saved/named views, no column drag-reorder or resize, no
// inline cell editing — see docs/parity-gaps.md.
export function ProjectCalendarTable({
  projectName,
  creatives,
  customColumns,
  onCxSave,
  cxReadOnly,
  isStaff,
  initialFocusDate,
}: {
  projectName: string;
  creatives: CreativeListRow[];
  customColumns: CustomColumnRow[];
  onCxSave: (creativeId: string, key: string, value: string | number | boolean | null) => void;
  cxReadOnly: boolean;
  isStaff: boolean;
  // The date to open on — defaults to today. The caller passes the
  // scheduled_at of a just-created brief (with a remount, via `key`) so a
  // post briefed for a different month doesn't land invisible outside
  // whatever period this view happened to already be showing.
  initialFocusDate?: string | null;
}) {
  const router = useRouter();
  const today = useMemo(() => new Date(), []);
  const [anchor, setAnchor] = useState(() => (initialFocusDate ? new Date(initialFocusDate) : today));
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [statusFilter, setStatusFilter] = useState<"all" | Band>("all");

  // No entry for a key means "visible" everywhere this is read (`!== false`)
  // — a new custom column needs no sync effect to default it to shown.
  const [columnVisibility, setColumnVisibility] = useState<Record<string, boolean>>({});
  const [columnOrder, setColumnOrder] = useState<string[]>(DEFAULT_COLUMN_ORDER);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});

  // Saved Views — agency-wide (hooks/use-calendar-views.ts), not stored
  // per-project. null activeViewId means "Main Table", the built-in
  // default that can be dirtied but never itself saved over.
  const { data: agency } = useMyAgency();
  const { data: savedViews } = useCalendarViews();
  const createView = useCreateCalendarView();
  const updateView = useUpdateCalendarView();
  const deleteView = useDeleteCalendarView();
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [saveModal, setSaveModal] = useState<{ mode: "create" | "rename"; initialName: string } | null>(null);
  const [viewMenuAnchor, setViewMenuAnchor] = useState<DOMRect | null>(null);
  const [saveDropdownAnchor, setSaveDropdownAnchor] = useState<DOMRect | null>(null);
  const saveDropdownBtnRef = useRef<HTMLButtonElement>(null);

  // Subscribing to an external event source while these popovers are open
  // — not a derived-state effect, so setState here is fine.
  useEffect(() => {
    if (!viewMenuAnchor && !saveDropdownAnchor) return;
    function onMouseDown(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (!target.closest(".colpop") && !target.closest(".vdots") && !target.closest(".split")) {
        setViewMenuAnchor(null);
        setSaveDropdownAnchor(null);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [viewMenuAnchor, saveDropdownAnchor]);

  const activeView = activeViewId ? (savedViews?.find((v) => v.id === activeViewId) ?? null) : null;
  const baselineOrder = activeView?.column_order ?? DEFAULT_COLUMN_ORDER;
  const baselineHidden = activeView?.hidden_columns ?? [];
  const baselineWidths = activeView?.column_widths ?? {};
  const currentHidden = hiddenListFromVisibility(columnVisibility);
  const isDirty =
    !sameStringArray(columnOrder, baselineOrder) ||
    !sameStringArray(currentHidden, baselineHidden) ||
    !sameWidths(columnWidths, baselineWidths);

  function loadView(view: CalendarViewRow | null) {
    setActiveViewId(view?.id ?? null);
    setColumnOrder(view ? view.column_order : DEFAULT_COLUMN_ORDER);
    setColumnVisibility(view ? Object.fromEntries(view.hidden_columns.map((k) => [k, false])) : {});
    setColumnWidths(view ? view.column_widths : {});
    setViewMenuAnchor(null);
  }

  function discardChanges() {
    loadView(activeView);
  }

  async function persistView(name: string, target: "create" | "update") {
    if (!agency) return;
    // Errors surface via createView.error/updateView.error (SaveViewModal
    // reads both) — caught here only so a real failure (e.g. this
    // session's calendar_views migration not applied yet) doesn't also
    // throw as an unhandled rejection out of an onClick handler.
    try {
      if (target === "update" && activeView) {
        const updated = await updateView.mutateAsync({
          id: activeView.id,
          name,
          columnOrder,
          hiddenColumns: currentHidden,
          columnWidths,
        });
        setActiveViewId(updated.id);
      } else {
        const created = await createView.mutateAsync({
          agencyId: agency.agencyId,
          name,
          columnOrder,
          hiddenColumns: currentHidden,
          columnWidths,
        });
        setActiveViewId(created.id);
      }
      setSaveModal(null);
    } catch {
      // Left open so the error message (and Cancel) stay visible when
      // this came from the modal; no-op otherwise.
    }
  }

  async function handleDeleteView() {
    if (!activeView) return;
    try {
      await deleteView.mutateAsync(activeView.id);
      loadView(null);
    } catch {
      // deleteView.error isn't surfaced anywhere today — the "..." menu
      // has no error slot — but this still must not throw unhandled out
      // of an onClick.
    }
  }

  const [columnsPopoverAnchor, setColumnsPopoverAnchor] = useState<DOMRect | null>(null);
  const columnsBtnRef = useRef<HTMLButtonElement>(null);

  // Column drag-to-reorder — plain mouse tracking + elementFromPoint hit
  // testing rather than native HTML5 drag-and-drop, which needs
  // dataTransfer wiring to work at all in Firefox and leaves a default
  // drag-image ghost that's more to fight than to use. Refs (not just
  // state) hold the live drag/drop keys so mouseup reads the latest
  // value instead of a value closed over at drag-start.
  const dragKeyRef = useRef<string | null>(null);
  const dropKeyRef = useRef<string | null>(null);
  const [dragVisual, setDragVisual] = useState<{ drag: string | null; drop: string | null }>({
    drag: null,
    drop: null,
  });

  function startColumnDrag(key: string, e: React.MouseEvent) {
    if ((e.target as HTMLElement).closest(".grip")) return;
    e.preventDefault();
    dragKeyRef.current = key;
    dropKeyRef.current = null;
    setDragVisual({ drag: key, drop: null });

    function onMove(moveEvent: MouseEvent) {
      const el = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY);
      const th = (el as HTMLElement | null)?.closest("th[data-col-key]") as HTMLElement | null;
      const overKey = th?.dataset.colKey ?? null;
      dropKeyRef.current = overKey;
      setDragVisual({ drag: dragKeyRef.current, drop: overKey });
    }
    function onUp() {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      const from = dragKeyRef.current;
      const to = dropKeyRef.current;
      if (from && to && from !== to) {
        setColumnOrder((prev) => {
          const resolved = resolveOrder(prev, allColumnKeys);
          const fromIdx = resolved.indexOf(from);
          const toIdx = resolved.indexOf(to);
          if (fromIdx === -1 || toIdx === -1) return prev;
          const next = [...resolved];
          next.splice(fromIdx, 1);
          next.splice(toIdx, 0, from);
          return next;
        });
      }
      dragKeyRef.current = null;
      dropKeyRef.current = null;
      setDragVisual({ drag: null, drop: null });
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  function startColumnResize(key: string, startWidth: number, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    function onMove(moveEvent: MouseEvent) {
      const next = Math.max(60, startWidth + (moveEvent.clientX - startX));
      setColumnWidths((prev) => ({ ...prev, [key]: next }));
    }
    function onUp() {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  // A short hide delay (not an instant clear on mouseleave) plus the
  // popover itself cancelling that delay on its own mouseenter is what
  // lets the preview "hold" while the pointer crosses from the trigger
  // onto the card — an instant hide raced the pointer there and closed it
  // before the card could ever be hovered.
  const [hover, setHover] = useState<{ creative: CreativeListRow; rect: DOMRect } | null>(null);
  const hoverTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  function handleEnter(creative: CreativeListRow, target: HTMLElement) {
    if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
    const rect = target.getBoundingClientRect();
    hoverTimeout.current = setTimeout(() => setHover({ creative, rect }), 200);
  }
  function scheduleHide() {
    if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
    hoverTimeout.current = setTimeout(() => setHover(null), 200);
  }
  function cancelHide() {
    if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
  }

  const hasAnyScheduled = creatives.some((c) => c.scheduled_at);

  // Batched once for the whole project, not once per row — same shape as
  // useProjectCreativeStats. Image on Text / Post Copy cells show the
  // latest copy_versions row (index 0, newest first); older versions
  // show on hover via CopyVersionHistoryPopover instead of their own
  // columns.
  const creativeIds = useMemo(() => creatives.map((c) => c.id), [creatives]);
  const { data: copyVersionsByCreative } = useCopyVersionsByCreative(creativeIds);
  const { data: latestFeedback } = useLatestFeedbackByCreative(creativeIds);

  // Second, independent hover pair for the copy-history popover — separate
  // from the creative-preview hover above since they show unrelated
  // content and can be triggered from different cells in the same row.
  const [copyHover, setCopyHover] = useState<{
    rect: DOMRect;
    label: string;
    rows: { versionNo: number; text: string }[];
  } | null>(null);
  const copyHoverTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  function handleCopyEnter(
    label: string,
    rows: { versionNo: number; text: string }[],
    target: HTMLElement,
  ) {
    if (copyHoverTimeout.current) clearTimeout(copyHoverTimeout.current);
    const rect = target.getBoundingClientRect();
    copyHoverTimeout.current = setTimeout(() => setCopyHover({ rect, label, rows }), 200);
  }
  function scheduleCopyHide() {
    if (copyHoverTimeout.current) clearTimeout(copyHoverTimeout.current);
    copyHoverTimeout.current = setTimeout(() => setCopyHover(null), 200);
  }
  function cancelCopyHide() {
    if (copyHoverTimeout.current) clearTimeout(copyHoverTimeout.current);
  }

  function versionRows(
    versions: CopyVersionSummary[] | undefined,
    field: "caption" | "slideText",
  ): { versionNo: number; text: string }[] {
    if (!versions) return [];
    return versions
      .map((v) => ({
        versionNo: v.versionNo,
        text: field === "caption" ? (v.caption ?? "") : v.slideText.filter(Boolean).join("\n"),
      }))
      .filter((v) => v.text);
  }

  const filtered = useMemo(() => {
    return creatives
      .filter((c) => c.scheduled_at)
      .filter((c) => statusFilter === "all" || bandOf(c.stage, c.exception) === statusFilter)
      .map((c) => ({ c, dt: new Date(c.scheduled_at as string) }))
      .sort((a, b) => a.dt.getTime() - b.dt.getTime());
  }, [creatives, statusFilter]);

  const weeks = useMemo(() => {
    const dayChunks = viewMode === "week" ? [getWeekDays(anchor)] : getMonthWeeks(anchor.getFullYear(), anchor.getMonth());
    return dayChunks
      .map((days) => {
        const keys = new Set(days.map(dateKey));
        const items = filtered.filter(({ dt }) => keys.has(dateKey(dt)));
        return { days, items };
      })
      .filter((w) => w.items.length > 0);
  }, [filtered, anchor, viewMode]);

  const totalShown = weeks.reduce((n, w) => n + w.items.length, 0);

  const toggleableColumns: ToggleableColumn[] = [
    ...TOGGLABLE_COLUMNS,
    ...customColumns.map((c) => ({ key: `cx:${c.id}`, label: c.label, sub: "" })),
  ];
  // One lookup for every reorderable/hideable column's static shape (label,
  // sub, default width), keyed the same way the picker/order/widths state
  // already keys them — custom columns use their `cx:{id}` key throughout.
  const allColumnDefs: Record<string, { label: string; sub: string; width: number }> = {};
  for (const c of TOGGLABLE_COLUMNS) allColumnDefs[c.key] = { label: c.label, sub: c.sub, width: c.width };
  for (const c of customColumns) {
    allColumnDefs[`cx:${c.id}`] = { label: c.label, sub: "", width: CUSTOM_COLUMN_WIDTH };
  }
  const allColumnKeys = Object.keys(allColumnDefs);
  const resolvedOrder = resolveOrder(columnOrder, allColumnKeys);
  const visibleOrderedKeys = resolvedOrder.filter((k) => columnVisibility[k] !== false);
  const columns = [
    ...FROZEN_COLUMNS.map((c) => ({ ...c, draggable: false })),
    ...visibleOrderedKeys.map((key) => ({
      key,
      label: allColumnDefs[key].label,
      sub: allColumnDefs[key].sub,
      width: columnWidths[key] ?? allColumnDefs[key].width,
      stickyClass: "",
      left: 0,
      draggable: true,
    })),
  ];
  const tableWidth = columns.reduce((sum, c) => sum + c.width, 0);
  const visibleColumnCount = FROZEN_COLUMNS.length + visibleOrderedKeys.length;
  const totalColumnCount = FROZEN_COLUMNS.length + allColumnKeys.length;
  const customColumnByKey = new Map(customColumns.map((c) => [`cx:${c.id}`, c]));

  function goPrev() {
    if (viewMode === "week") {
      setAnchor((a) => {
        const next = new Date(a);
        next.setDate(next.getDate() - 7);
        return next;
      });
    } else {
      setAnchor((a) => new Date(a.getFullYear(), a.getMonth() - 1, 1));
    }
  }
  function goNext() {
    if (viewMode === "week") {
      setAnchor((a) => {
        const next = new Date(a);
        next.setDate(next.getDate() + 7);
        return next;
      });
    } else {
      setAnchor((a) => new Date(a.getFullYear(), a.getMonth() + 1, 1));
    }
  }
  function goToday() {
    setAnchor(today);
  }

  const monthLabel = useMemo(() => {
    if (viewMode !== "week") return `${MONTH_NAMES[anchor.getMonth()]} ${anchor.getFullYear()}`;
    const days = getWeekDays(anchor);
    const [start, end] = [days[0], days[6]];
    return `${start.getDate()} ${MONTH_ABBR[start.getMonth()]} – ${end.getDate()} ${MONTH_ABBR[end.getMonth()]} ${end.getFullYear()}`;
  }, [anchor, viewMode]);

  const todayKey = dateKey(today);

  return (
    <>
      <p className="sub">
        {totalShown} scheduled post{totalShown === 1 ? "" : "s"} in this view.
      </p>

      <div className="viewbar">
        <button
          type="button"
          role="tab"
          className="vtab"
          aria-selected={activeViewId === null}
          onClick={() => loadView(null)}
        >
          Main Table
        </button>
        {(savedViews ?? []).map((v) => (
          <button
            type="button"
            role="tab"
            key={v.id}
            className="vtab"
            aria-selected={activeViewId === v.id}
            onClick={() => loadView(v)}
          >
            {v.name}
            {activeViewId === v.id && isDirty && <span className="dot2" />}
            {activeViewId === v.id && (
              <span
                className="vdots"
                title="View options"
                onClick={(e) => {
                  e.stopPropagation();
                  setViewMenuAnchor((e.currentTarget as HTMLElement).getBoundingClientRect());
                }}
              >
                <svg viewBox="0 0 24 24">
                  <circle cx="12" cy="6" r="1.5" />
                  <circle cx="12" cy="12" r="1.5" />
                  <circle cx="12" cy="18" r="1.5" />
                </svg>
              </span>
            )}
          </button>
        ))}
        <span
          className="vadd"
          title="Save current layout as a new view"
          onClick={() => setSaveModal({ mode: "create", initialName: "" })}
        >
          <svg viewBox="0 0 24 24">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </span>
      </div>

      {viewMenuAnchor && activeView && (
        <div
          className="colpop on"
          style={{ left: viewMenuAnchor.left, top: viewMenuAnchor.bottom + 4, width: 180 }}
        >
          <div className="cp-b" style={{ padding: "4px 4px" }}>
            <button
              type="button"
              className="cpr"
              onClick={() => {
                setSaveModal({ mode: "rename", initialName: activeView.name });
                setViewMenuAnchor(null);
              }}
            >
              <span className="cn">Rename</span>
            </button>
            <button
              type="button"
              className="cpr"
              onClick={() => {
                setViewMenuAnchor(null);
                handleDeleteView();
              }}
            >
              <span className="cn" style={{ color: "var(--rose)" }}>
                Delete
              </span>
            </button>
          </div>
        </div>
      )}

      <div className="calbar">
        <div className="calnav">
          <button type="button" onClick={goPrev} title="Previous">
            <svg viewBox="0 0 24 24">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <button type="button" onClick={goNext} title="Next">
            <svg viewBox="0 0 24 24">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
        </div>
        <div className="calmonth">{monthLabel}</div>
        <button className="btn sm" type="button" onClick={goToday}>
          Today
        </button>
        <div className="seg2">
          <button type="button" aria-pressed={viewMode === "week"} onClick={() => setViewMode("week")}>
            Week
          </button>
          <button type="button" aria-pressed={viewMode === "month"} onClick={() => setViewMode("month")}>
            Month
          </button>
          <button type="button" aria-pressed={viewMode === "calendar"} onClick={() => setViewMode("calendar")}>
            Calendar
          </button>
        </div>
        <div style={{ flex: 1 }} />
        <span className="kbadge sch">
          <svg viewBox="0 0 24 24">
            <rect x="3" y="5" width="18" height="16" rx="2" />
            <path d="M3 10h18M8 3v4M16 3v4" />
          </svg>
          Scheduled
        </span>
        <select
          className="sort"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as "all" | Band)}
        >
          {STATUS_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
        {viewMode !== "calendar" && (
          <button
            className="btn sm"
            type="button"
            ref={columnsBtnRef}
            onClick={() => setColumnsPopoverAnchor(columnsBtnRef.current!.getBoundingClientRect())}
          >
            Columns {visibleColumnCount}/{totalColumnCount}
          </button>
        )}
        {viewMode !== "calendar" && isDirty && (
          <span className="split">
            <button
              type="button"
              className="btn primary sm"
              onClick={() =>
                activeView
                  ? persistView(activeView.name, "update")
                  : setSaveModal({ mode: "create", initialName: "" })
              }
            >
              {activeView ? "Save" : "Save as New View"}
            </button>
            <button
              type="button"
              className="btn primary sm split-t"
              ref={saveDropdownBtnRef}
              onClick={() =>
                setSaveDropdownAnchor((prev) =>
                  prev ? null : saveDropdownBtnRef.current!.getBoundingClientRect(),
                )
              }
            >
              <svg viewBox="0 0 24 24">
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
            {saveDropdownAnchor && (
              <div
                className="colpop on"
                style={{ left: saveDropdownAnchor.right - 210, top: saveDropdownAnchor.bottom + 4, width: 210 }}
              >
                <div className="cp-b" style={{ padding: "4px 4px" }}>
                  {activeView && (
                    <button
                      type="button"
                      className="cpr"
                      onClick={() => {
                        setSaveDropdownAnchor(null);
                        persistView(activeView.name, "update");
                      }}
                    >
                      <span className="cn">Save to &ldquo;{activeView.name}&rdquo;</span>
                    </button>
                  )}
                  <button
                    type="button"
                    className="cpr"
                    onClick={() => {
                      setSaveDropdownAnchor(null);
                      setSaveModal({ mode: "create", initialName: "" });
                    }}
                  >
                    <span className="cn">Save as New View</span>
                  </button>
                  <button
                    type="button"
                    className="cpr"
                    onClick={() => {
                      setSaveDropdownAnchor(null);
                      discardChanges();
                    }}
                  >
                    <span className="cn" style={{ color: "var(--rose)" }}>
                      Discard Changes
                    </span>
                  </button>
                </div>
              </div>
            )}
          </span>
        )}
      </div>

      {viewMode === "calendar" ? (
        <ProjectCalendarGrid
          year={anchor.getFullYear()}
          month={anchor.getMonth()}
          creatives={creatives}
          statusFilter={statusFilter}
        />
      ) : weeks.length === 0 ? (
        <div className="empty">
          <b>Nothing scheduled</b>
          <span>
            {!hasAnyScheduled
              ? `Nothing scheduled in ${projectName} yet.${isStaff ? " Use New Brief to write the first one." : ""}`
              : `No posts match these filters in ${monthLabel}.`}
          </span>
        </div>
      ) : (
        <div className="tblwrap">
          <table className="tbl" style={{ width: tableWidth }}>
            <colgroup>
              {columns.map((c) => (
                <col key={c.key} style={{ width: c.width }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                {columns.map((c) => {
                  const classes = [
                    c.key === "clientFeedback" ? "feedback" : c.stickyClass,
                    c.draggable ? "dragcol" : "",
                    dragVisual.drag === c.key ? "dragging" : "",
                    c.draggable && dragVisual.drop === c.key && dragVisual.drag !== c.key ? "drop-target" : "",
                  ]
                    .filter(Boolean)
                    .join(" ");
                  return (
                    <th
                      key={c.key}
                      data-col-key={c.key}
                      className={classes}
                      style={c.stickyClass ? { left: c.left } : undefined}
                      onMouseDown={c.draggable ? (e) => startColumnDrag(c.key, e) : undefined}
                    >
                      {c.label}
                      {c.sub && <small>{c.sub}</small>}
                      {c.draggable && (
                        <span
                          className="grip"
                          onMouseDown={(e) => startColumnResize(c.key, c.width, e)}
                        />
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {weeks.map(({ days, items }) => (
                <Fragment key={dateKey(days[0])}>
                  {viewMode === "month" && (
                    <tr className="wkband">
                      <td colSpan={columns.length}>
                        <span className="bandin">
                          Week {isoWeekNumber(days[0])}
                          <span className="rng">
                            {days[0].getDate()} {MONTH_ABBR[days[0].getMonth()]} –{" "}
                            {days[6].getDate()} {MONTH_ABBR[days[6].getMonth()]}
                          </span>
                          <span className="cnt">{items.length} scheduled</span>
                        </span>
                      </td>
                    </tr>
                  )}
                  {items.map(({ c, dt }) => {
                    const band = bandOf(c.stage, c.exception);
                    const color = stageColor(c.stage, c.exception);
                    const format = formatById(c.format);
                    const rowClasses = [
                      band === "approved" ? "done" : "",
                      dateKey(dt) === todayKey ? "istoday" : "",
                    ]
                      .filter(Boolean)
                      .join(" ");
                    return (
                      <tr
                        data-row=""
                        className={rowClasses}
                        key={c.id}
                        onClick={() => router.push(`/creatives/${c.id}`)}
                      >
                        <td className="sk1" style={{ left: 0 }}>
                          <b>{isoWeekNumber(dt)}</b>
                        </td>
                        <td className="sk2" style={{ left: 66 }}>
                          {dt.getDate()} {MONTH_ABBR[dt.getMonth()]} {String(dt.getFullYear()).slice(2)}
                        </td>
                        <td className="sk3" style={{ left: 158 }}>
                          {DAY_ABBR[(dt.getDay() + 6) % 7]}
                        </td>
                        {visibleOrderedKeys.map((key) => {
                          switch (key) {
                            case "time":
                              return (
                                <td key={key}>
                                  <span className="tdim">{timeOf(dt)}</span>
                                </td>
                              );
                            case "status":
                              return (
                                <td key={key}>
                                  <span className="stg" style={{ background: `${color}1A`, color }}>
                                    {c.exception ? (
                                      exceptionLabel(c.exception)
                                    ) : (
                                      <>
                                        <span className="no">{c.stage}.</span>
                                        {stageLabel(c.stage, "scheduled")}
                                      </>
                                    )}
                                  </span>
                                </td>
                              );
                            case "type":
                              return (
                                <td key={key}>
                                  <span className="tdim">{format?.label ?? c.format}</span>
                                </td>
                              );
                            case "lead":
                              return (
                                <td key={key}>
                                  {c.lead ? (
                                    <span className="lead">
                                      <i style={{ background: "#6B7280" }}>
                                        {c.lead.name.slice(0, 1).toUpperCase()}
                                      </i>
                                      {c.lead.name}
                                    </span>
                                  ) : (
                                    <span className="tdim">—</span>
                                  )}
                                </td>
                              );
                            case "platform":
                              return (
                                <td key={key}>
                                  {c.platforms?.length ? (
                                    c.platforms.map((p) => (
                                      <span
                                        key={p}
                                        className="pchip"
                                        style={{ background: `${platformColor(p)}1A`, color: platformColor(p) }}
                                      >
                                        {p}
                                      </span>
                                    ))
                                  ) : (
                                    <span className="tdim">—</span>
                                  )}
                                </td>
                              );
                            case "creative":
                              return (
                                <td key={key}>
                                  <button
                                    type="button"
                                    className="pname"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      router.push(`/creatives/${c.id}`);
                                    }}
                                    onMouseEnter={(e) => handleEnter(c, e.currentTarget)}
                                    onMouseLeave={scheduleHide}
                                  >
                                    {c.name}
                                  </button>
                                </td>
                              );
                            case "concept":
                              return (
                                <td key={key} className="cellw">
                                  {c.concept || <span className="tdim">—</span>}
                                </td>
                              );
                            case "approach":
                              return (
                                <td key={key} className="cellw">
                                  {c.approach_notes?.length ? (
                                    c.approach_notes.map((a, i) => <div key={i}>• {a}</div>)
                                  ) : (
                                    <span className="tdim">—</span>
                                  )}
                                </td>
                              );
                            case "imageOnText":
                            case "postCopy": {
                              const field = key === "postCopy" ? "caption" : "slideText";
                              const rows = versionRows(copyVersionsByCreative?.[c.id], field);
                              const latest = rows[0];
                              const label = key === "postCopy" ? "Post Copy" : "Image on Text";
                              return (
                                <td key={key} className="cellw">
                                  {latest ? (
                                    <span
                                      className="copyc"
                                      onMouseEnter={(e) =>
                                        rows.length > 1 && handleCopyEnter(label, rows, e.currentTarget)
                                      }
                                      onMouseLeave={scheduleCopyHide}
                                    >
                                      <span className="cc-t">{latest.text}</span>
                                      {rows.length > 1 && (
                                        <span className="cc-n">+{rows.length - 1} earlier</span>
                                      )}
                                    </span>
                                  ) : (
                                    <span className="tdim">—</span>
                                  )}
                                </td>
                              );
                            }
                            case "clientFeedback": {
                              const feedback = latestFeedback?.[c.id];
                              return (
                                <td key={key} className="cellw">
                                  {feedback ? (
                                    <span className="feedback-note">{feedback.body}</span>
                                  ) : (
                                    <span className="tdim">—</span>
                                  )}
                                </td>
                              );
                            }
                            default: {
                              const customCol = customColumnByKey.get(key);
                              if (!customCol) return null;
                              return (
                                <td key={key}>
                                  <CxCell
                                    column={customCol}
                                    value={c.cx?.[customCol.key] ?? null}
                                    onSave={(value) => onCxSave(c.id, customCol.key, value)}
                                    readOnly={cxReadOnly}
                                  />
                                </td>
                              );
                            }
                          }
                        })}
                      </tr>
                    );
                  })}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="callegend">
        {Array.from({ length: 4 }, (_, i) => i + 1).map((stage) => (
          <span key={stage}>
            <i style={{ background: stageColor(stage, null) }} />
            {stage} {stageLabel(stage, "scheduled")}
          </span>
        ))}
      </div>

      {columnsPopoverAnchor && (
        <ColumnsPopover
          anchorRect={columnsPopoverAnchor}
          columns={toggleableColumns}
          visibility={columnVisibility}
          frozenCount={FROZEN_COLUMNS.length}
          onToggle={(key) =>
            setColumnVisibility((prev) => ({ ...prev, [key]: prev[key] === false }))
          }
          onToggleAll={(checked) =>
            setColumnVisibility((prev) => {
              const next = { ...prev };
              for (const col of toggleableColumns) next[col.key] = checked;
              return next;
            })
          }
          onClose={() => setColumnsPopoverAnchor(null)}
        />
      )}

      {hover && (
        <CreativePreviewPopover
          creative={hover.creative}
          anchorRect={hover.rect}
          onMouseEnter={cancelHide}
          onMouseLeave={scheduleHide}
        />
      )}

      {copyHover && (
        <CopyVersionHistoryPopover
          label={copyHover.label}
          rows={copyHover.rows}
          anchorRect={copyHover.rect}
          onMouseEnter={cancelCopyHide}
          onMouseLeave={scheduleCopyHide}
        />
      )}

      {saveModal && (
        <SaveViewModal
          mode={saveModal.mode}
          initialName={saveModal.initialName}
          existingNames={(savedViews ?? [])
            .filter((v) => v.id !== activeViewId)
            .map((v) => v.name)}
          submitError={
            createView.error
              ? errorMessage(createView.error, "Couldn't save this view")
              : updateView.error
                ? errorMessage(updateView.error, "Couldn't save this view")
                : null
          }
          isSaving={createView.isPending || updateView.isPending}
          onCancel={() => setSaveModal(null)}
          onSave={(name) => persistView(name, saveModal.mode === "rename" ? "update" : "create")}
        />
      )}
    </>
  );
}
