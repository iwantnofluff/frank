"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { usePresence } from "@/hooks/use-presence";
import { useViewportFit } from "@/hooks/use-viewport-fit";
import { useRouter } from "next/navigation";
import { useProjectRoles } from "@/hooks/use-project-roles";
import type { CreativeListRow } from "@/hooks/use-creatives";
import type { CustomColumnRow } from "@/hooks/use-custom-columns";
import { useArchiveCreatives } from "@/hooks/use-archive-creatives";
import { useDeleteCreativesPermanently } from "@/hooks/use-delete-creatives-permanently";
import { CxCell } from "@/components/project/CxCell";
import { ReferenceLinks } from "@/components/project/ReferenceLinks";
import { ClampText } from "@/components/project/ClampText";
import { ContinuousCalendarGrid } from "@/components/project/ContinuousCalendarGrid";
import { ColumnsPopover, type ToggleableColumn } from "@/components/project/ColumnsPopover";
import { CreativePreviewPopover } from "@/components/project/CreativePreviewPopover";
import { SaveViewModal } from "@/components/project/SaveViewModal";
import { PermanentDeleteConfirm } from "@/components/project/PermanentDeleteConfirm";
import { bandOf, stageLabel, stageColor, exceptionLabel, type Band } from "@/lib/stage-labels";
import { errorMessage } from "@/lib/errors";
import { getMonthWeeks, getWeekDays, isoWeekNumber, dateKey } from "@/lib/calendar-weeks";
import { useMyAgency } from "@/hooks/use-my-agency";
import { useCopyVersionsByCreative } from "@/hooks/use-copy-versions-by-creative";
import { VersionedTextCell } from "@/components/project/VersionedTextCell";
import { copySummary, formatsLabel, postFormats } from "@/lib/formats";
import { DraftEditBar, DraftField, useDraftPost } from "@/components/project/draft-post";
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

type ViewMode = "week" | "month" | "calendar";

const STATUS_FILTERS: { value: "all" | Band; label: string }[] = [
  { value: "all", label: "All Statuses" },
  { value: "internal", label: "In Production" },
  { value: "review", label: "Client Review" },
  { value: "changes_requested", label: "Changes Requested" },
  { value: "rejected", label: "Rejected" },
  { value: "approved", label: "Approved" },
];

// One frozen date column — no Week-number/Day-of-week split the way
// Scheduled has, since that's not part of the 13-field template this
// table was built against (see docs/parity-gaps.md).
const FROZEN_COLUMNS = [
  { key: "date", label: "Live Date", sub: "Launch date", width: 104, stickyClass: "sk1", left: 0 },
] as const;

// Staff-only checkbox column, sticky ahead of Live Date when shown — not
// one of FROZEN_COLUMNS: it's a selection affordance, not a data column,
// so it's excluded from the Columns picker's counts and rendered by hand
// rather than through the `columns` array below.
const CHECKBOX_COL_WIDTH = 36;

// The 13-field content-planner template supplied directly, replacing the
// generic Creative/Format/Destination/Added/Due/Stage columns the old flat
// .ptable had. Real schema fields map onto real columns (creative/
// placement/status/conceptRef/notes); the rest have no schema column of
// their own and read/write creatives.cx — the same jsonb blob genuine
// per-project custom columns already use, just under fixed keys rather
// than a real custom_columns row (see docs/parity-gaps.md).
//
// Names match the New Post window's own (direct instruction): Post Name,
// Destination, Format, Slides, Lead, Concept and Reference, Text on Image,
// Copy, WIIFM Direction. Format is the formats chosen in the window (the
// old Static/Video "Type" choice is kept in cx.type, no longer shown).
// Text on Image and Copy are the real copy versions, as on the scheduled
// table; the old free-text V1/V2 Copy stay in cx.v1_copy/v2_copy, no
// longer shown. Notes for Designer is its own text (cx.designer_notes),
// also in the window; it used to show the WIIFM direction, which now has
// its own column.
const TOGGLABLE_COLUMNS = [
  { key: "creative", label: "Post Name", sub: "Concept title", width: 196 },
  { key: "placement", label: "Destination", sub: "ASIN, URL or location", width: 140 },
  { key: "funnel", label: "Funnel", sub: "Funnel stage", width: 150 },
  { key: "tg", label: "TG", sub: "Target audience", width: 130 },
  { key: "type", label: "Format", sub: "Where it goes out", width: 150 },
  { key: "slides", label: "Slides", sub: "Carousels", width: 74 },
  // Renamed Team and 20% wider (direct instruction), for a role after the
  // name.
  { key: "lead", label: "Team", sub: "Person and role", width: 134 },
  { key: "status", label: "Status", sub: "Workflow state", width: 156 },
  { key: "conceptRef", label: "Concept and Reference", sub: "Visual brief", width: 260 },
  { key: "finalCreative", label: "Final Creative", sub: "Approved asset", width: 200 },
  { key: "imageOnText", label: "Text on Image", sub: "On the artwork", width: 220 },
  { key: "copy", label: "Copy", sub: "Latest version", width: 330 },
  { key: "notes", label: "Notes for Designer", sub: "Design feedback", width: 220 },
  { key: "approach", label: "WIIFM Direction", sub: "What the reader gets", width: 472 },
  { key: "principles", label: "Principles", sub: "Psychological angle", width: 180 },
] as const;

const CUSTOM_COLUMN_WIDTH = 140;
const DEFAULT_COLUMN_ORDER = TOGGLABLE_COLUMNS.map((c) => c.key);

// Same colour palette AddColumnForm.tsx already uses for a real "status"-
// type custom column, reused here for consistency even though these two
// aren't real custom_columns rows.
const FUNNEL_OPTIONS = [
  { value: "tof", label: "TOF (Top of Funnel)", colour: "#007BFF" },
  { value: "mof", label: "MOF (Middle of Funnel)", colour: "#2BB65B" },
  { value: "bof", label: "BOF (Bottom of Funnel)", colour: "#FF8A00" },
];

// Fake CustomColumnRow-shaped objects, stable across renders — CxCell only
// cares about the shape, not where it came from, so Funnel/Type/TG/Final
// Creative/Principles get its existing dropdown-chip/text editing for free,
// reading and writing through the same creatives.cx blob and the same
// onCxSave callback the page already wires up for real custom columns.
export const FUNNEL_COLUMN: CustomColumnRow = { id: "funnel", key: "funnel", label: "Funnel", type: "status", options: FUNNEL_OPTIONS, position: 0 };
export const DESIGNER_NOTES_COLUMN: CustomColumnRow = { id: "designer_notes", key: "designer_notes", label: "Notes for Designer", type: "text", options: null, position: 0 };
const TG_COLUMN: CustomColumnRow = { id: "tg", key: "tg", label: "TG", type: "text", options: null, position: 0 };
const FINAL_CREATIVE_COLUMN: CustomColumnRow = { id: "final_creative", key: "final_creative", label: "Final Creative", type: "text", options: null, position: 0 };
const PRINCIPLES_COLUMN: CustomColumnRow = { id: "principles", key: "principles", label: "Principles", type: "text", options: null, position: 0 };

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

// Copy of ProjectCalendarTable.tsx, built for continuous-delivery projects
// against a specific 13-field content-planner template (direct instruction
// — see docs/parity-gaps.md). Same functionality throughout (drag-resize/
// reorder, saved named views, Columns picker, week/month/calendar-grid
// navigation) — only the column definitions and per-key cell rendering
// differ, and due_on drives grouping/filtering in place of scheduled_at.
export function ContinuousCalendarTable({
  projectId,
  projectName,
  creatives,
  archiveMode,
  customColumns,
  onCxSave,
  cxReadOnly,
  isStaff,
  initialFocusDate,
  draftRow,
}: {
  projectId: string;
  projectName: string;
  creatives: CreativeListRow[];
  // Which half of the page's own Active/Archived toggle `creatives` was
  // already filtered to — drives the checkbox bar's label and which way
  // the archive mutation writes (delete vs. restore), same rows either
  // way.
  archiveMode: "active" | "archived";
  customColumns: CustomColumnRow[];
  onCxSave: (creativeId: string, key: string, value: string | number | boolean | null) => void;
  cxReadOnly: boolean;
  isStaff: boolean;
  // The date to open on — defaults to today. The caller passes the due_on
  // of a just-created brief (with a remount, via `key`) so a post briefed
  // for a different month doesn't land invisible outside whatever period
  // this view happened to already be showing.
  initialFocusDate?: string | null;
  // Set while New Post → Row is open (components/project/draft-post.tsx).
  draftRow?: { onClose: () => void; onCreated: (focusDate: string | null) => void } | null;
}) {
  const draft = useDraftPost({
    projectId,
    delivery: "continuous",
    onCreated: (d) => draftRow?.onCreated(d),
  });
  const router = useRouter();
  // Each person's role here, after their name in the Team column (phase85).
  const { data: roles } = useProjectRoles(projectId);
  const today = useMemo(() => new Date(), []);
  const [anchor, setAnchor] = useState(() => (initialFocusDate ? new Date(initialFocusDate) : today));
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  if (draftRow && viewMode === "calendar") setViewMode("month");
  const [statusFilter, setStatusFilter] = useState<"all" | Band>("all");

  // Checkbox multi-select — table views only (Week/Month), not the
  // Calendar grid. Cleared whenever the underlying row set changes (the
  // page's own Active/Archived toggle, or a successful archive/restore),
  // so a stale selection never lingers pointing at rows no longer shown.
  // Adjusted during render rather than in an effect (react.dev, "Adjusting
  // some state when a prop changes") — an effect here would set state one
  // render late, briefly showing the stale selection against new rows.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [prevCreatives, setPrevCreatives] = useState(creatives);
  if (prevCreatives !== creatives) {
    setPrevCreatives(creatives);
    setSelected(new Set());
  }
  const archiveCreatives = useArchiveCreatives(projectId);
  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  async function handleBulkArchive() {
    await archiveCreatives.mutateAsync({
      creativeIds: Array.from(selected),
      archived: archiveMode === "active",
    });
    setSelected(new Set());
  }
  const deleteCreatives = useDeleteCreativesPermanently(projectId);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  async function handlePermanentDelete() {
    await deleteCreatives.mutateAsync(Array.from(selected));
    setConfirmDeleteOpen(false);
    setSelected(new Set());
  }

  // No entry for a key means "visible" everywhere this is read (`!== false`)
  // — a new custom column needs no sync effect to default it to shown.
  const [columnVisibility, setColumnVisibility] = useState<Record<string, boolean>>({});
  const [columnOrder, setColumnOrder] = useState<string[]>(DEFAULT_COLUMN_ORDER);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});

  // Saved Views — agency-wide (hooks/use-calendar-views.ts), scoped to
  // "continuous" (phase14_calendar_views_table_type.sql) so a view saved
  // here never shows up as a nonsensical tab on the Scheduled table, and
  // vice versa. null activeViewId means "Main Table", the built-in
  // default that can be dirtied but never itself saved over.
  const { data: agency } = useMyAgency();
  const { data: savedViews } = useCalendarViews("continuous");
  const createView = useCreateCalendarView();
  const updateView = useUpdateCalendarView();
  const deleteView = useDeleteCalendarView();
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [saveModal, setSaveModal] = useState<{ mode: "create" | "rename"; initialName: string } | null>(null);
  const [viewMenuAnchor, setViewMenuAnchor] = useState<DOMRect | null>(null);
  const [saveDropdownAnchor, setSaveDropdownAnchor] = useState<DOMRect | null>(null);
  const saveDropdownBtnRef = useRef<HTMLButtonElement>(null);
  const viewMenuRef = useRef<HTMLDivElement>(null);
  const saveDropdownRef = useRef<HTMLDivElement>(null);
  // Each menu opens and closes with motion (hooks/use-presence.ts).
  const viewMenu = usePresence(viewMenuAnchor);
  const saveDropdown = usePresence(saveDropdownAnchor);
  useViewportFit(viewMenuRef, viewMenu.shown, { side: "below", gap: 4 });
  useViewportFit(saveDropdownRef, saveDropdown.shown, { side: "below", align: "end", gap: 4 });

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
    // reads both) — caught here only so a real failure doesn't also throw
    // as an unhandled rejection out of an onClick handler.
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
          tableType: "continuous",
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
  const columnsPop = usePresence(columnsPopoverAnchor);
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

  const hasAnyDue = creatives.some((c) => c.due_on);

  // Every copy version, batched for the project: the Text on Image and
  // Copy columns show the latest, older ones on hover.
  const creativeIds = useMemo(() => creatives.map((c) => c.id), [creatives]);
  // The row whose long cells are expanded (direct instruction): one row at
  // a time; Read more in any of its cells opens all of them.
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const toggleRow = (id: string) => setExpandedRow((r) => (r === id ? null : id));
  const { data: copyVersionsByCreative } = useCopyVersionsByCreative(creativeIds);

  const filtered = useMemo(() => {
    return creatives
      .filter((c) => c.due_on)
      .filter((c) => statusFilter === "all" || bandOf(c.stage, c.exception) === statusFilter)
      .map((c) => ({ c, dt: new Date(c.due_on as string) }))
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
  const allVisibleIds = useMemo(
    () => weeks.flatMap((w) => w.items.map(({ c }) => c.id)),
    [weeks],
  );
  const allVisibleSelected = allVisibleIds.length > 0 && allVisibleIds.every((id) => selected.has(id));
  function toggleSelectAll() {
    setSelected(allVisibleSelected ? new Set() : new Set(allVisibleIds));
  }

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
  // Frozen columns' left offsets shift right by the checkbox column's own
  // width whenever it's shown, so both keep sitting flush against each
  // other rather than the checkbox overlapping Live Date.
  const skOffset = isStaff ? CHECKBOX_COL_WIDTH : 0;
  const columns = [
    ...FROZEN_COLUMNS.map((c) => ({ ...c, draggable: false, left: c.left + skOffset })),
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
  const tableWidth = columns.reduce((sum, c) => sum + c.width, 0) + skOffset;
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
      <p className="sub" style={{ marginTop: 14, marginBottom: 14 }}>
        {totalShown} creative{totalShown === 1 ? "" : "s"} due in this view.
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

      {viewMenu.shown && activeView && (
        <div
          className={`colpop on motion${viewMenu.isOpen ? " is-open" : ""}`}
          ref={viewMenuRef}
          style={{ width: 180 }}
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
            {saveDropdown.shown && (
              <div
                className={`colpop on motion${saveDropdown.isOpen ? " is-open" : ""}`}
                ref={saveDropdownRef}
                style={{ width: 210 }}
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

      {viewMode !== "calendar" && isStaff && selected.size > 0 && (
        <div className="selectionbar">
          <span>{selected.size} selected</span>
          <div style={{ flex: 1 }} />
          <button type="button" className="btn sm" onClick={() => setSelected(new Set())}>
            Cancel
          </button>
          <button
            type="button"
            className="btn sm"
            disabled={archiveCreatives.isPending}
            onClick={handleBulkArchive}
          >
            {archiveCreatives.isPending
              ? archiveMode === "archived"
                ? "Restoring…"
                : "Archiving…"
              : archiveMode === "archived"
                ? "Restore"
                : "Archive"}
          </button>
          <button
            type="button"
            className="btn sm danger"
            onClick={() => setConfirmDeleteOpen(true)}
          >
            Permanently Delete
          </button>
        </div>
      )}
      {archiveCreatives.error && (
        <p className="autherr">{errorMessage(archiveCreatives.error, "Couldn't update these posts")}</p>
      )}
      {confirmDeleteOpen && (
        <PermanentDeleteConfirm
          count={selected.size}
          isPending={deleteCreatives.isPending}
          error={deleteCreatives.error}
          onConfirm={handlePermanentDelete}
          onClose={() => setConfirmDeleteOpen(false)}
        />
      )}

      {draftRow && (
        <DraftEditBar
          label={`New post in ${projectName}`}
          blocked={
            !visibleOrderedKeys.includes("creative")
              ? "Show the Creative Name column to name the post"
              : !visibleOrderedKeys.includes("placement")
                ? "Show the Placement column to say where it goes"
                : null
          }
          problem={draft.problem}
          saving={draft.saving}
          onCancel={draftRow.onClose}
          onSave={draft.save}
        />
      )}

      {viewMode === "calendar" ? (
        <ContinuousCalendarGrid
          year={anchor.getFullYear()}
          month={anchor.getMonth()}
          creatives={creatives}
          statusFilter={statusFilter}
        />
      ) : weeks.length === 0 && !draftRow ? (
        <div className="empty">
          <b>Nothing due</b>
          <span>
            {!hasAnyDue
              ? `Nothing due in ${projectName} yet.${isStaff ? " Use New Post to write the first one." : ""}`
              : `No creatives match these filters in ${monthLabel}.`}
          </span>
        </div>
      ) : (
        <div className="tblwrap">
          <table className="tbl" style={{ width: tableWidth }}>
            <colgroup>
              {isStaff && <col style={{ width: CHECKBOX_COL_WIDTH }} />}
              {columns.map((c) => (
                <col key={c.key} style={{ width: c.width }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                {isStaff && (
                  <th className="skchk" style={{ left: 0 }}>
                    <input
                      type="checkbox"
                      aria-label="Select all"
                      checked={allVisibleSelected}
                      onChange={toggleSelectAll}
                    />
                  </th>
                )}
                {columns.map((c) => {
                  const classes = [
                    c.stickyClass,
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
              {draftRow && (
                <tr className="draft" data-draft="">
                  {isStaff && <td className="skchk" style={{ left: 0 }} />}
                  <td className="sk1" style={{ left: skOffset }}>
                    <DraftField draft={draft} field="date" />
                  </td>
                  {visibleOrderedKeys.map((key) => {
                    const field =
                      key === "creative"
                        ? "name"
                        : key === "placement"
                          ? "destination"
                          : key === "type"
                            ? "format"
                            : key === "lead"
                              ? "lead"
                              : key === "conceptRef"
                                ? "concept"
                                : null;
                    return (
                      <td key={key} className={key === "conceptRef" ? "cellw" : undefined}>
                        {field ? (
                          <DraftField draft={draft} field={field} />
                        ) : key === "status" ? (
                          <span className="tdim">1. {stageLabel(1, "continuous")}</span>
                        ) : null}
                      </td>
                    );
                  })}
                </tr>
              )}
              {weeks.map(({ days, items }) => (
                <Fragment key={dateKey(days[0])}>
                  {viewMode === "month" && (
                    <tr className="wkband">
                      <td colSpan={columns.length + (isStaff ? 1 : 0)}>
                        <span className="bandin">
                          Week {isoWeekNumber(days[0])}
                          <span className="rng">
                            {days[0].getDate()} {MONTH_ABBR[days[0].getMonth()]} –{" "}
                            {days[6].getDate()} {MONTH_ABBR[days[6].getMonth()]}
                          </span>
                          <span className="cnt">{items.length} due</span>
                        </span>
                      </td>
                    </tr>
                  )}
                  {items.map(({ c, dt }) => {
                    const band = bandOf(c.stage, c.exception);
                    const color = stageColor(c.stage, c.exception);
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
                        {isStaff && (
                          <td className="skchk" style={{ left: 0 }} onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              aria-label={`Select ${c.name}`}
                              checked={selected.has(c.id)}
                              onChange={() => toggleSelected(c.id)}
                            />
                          </td>
                        )}
                        <td className="sk1" style={{ left: skOffset }}>
                          {dt.getDate()} {MONTH_ABBR[dt.getMonth()]} {String(dt.getFullYear()).slice(2)}
                        </td>
                        {visibleOrderedKeys.map((key) => {
                          switch (key) {
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
                            case "placement":
                              return (
                                <td key={key}>
                                  {c.destination || <span className="tdim">—</span>}
                                </td>
                              );
                            case "funnel":
                              return (
                                <td key={key}>
                                  <CxCell
                                    column={FUNNEL_COLUMN}
                                    value={c.cx?.["funnel"] ?? null}
                                    onSave={(value) => onCxSave(c.id, "funnel", value)}
                                    readOnly={cxReadOnly}
                                  />
                                </td>
                              );
                            case "tg":
                              return (
                                <td key={key}>
                                  <CxCell
                                    column={TG_COLUMN}
                                    value={c.cx?.["tg"] ?? null}
                                    onSave={(value) => onCxSave(c.id, "tg", value)}
                                    readOnly={cxReadOnly}
                                  />
                                </td>
                              );
                            case "type":
                              return (
                                <td key={key}>
                                  <span className="tdim">{formatsLabel(postFormats(c))}</span>
                                </td>
                              );
                            case "slides":
                              return (
                                <td key={key}>
                                  {c.slide_count ? c.slide_count : <span className="tdim">—</span>}
                                </td>
                              );
                            case "lead":
                              return (
                                <td key={key}>
                                  {/* Everyone on the post (phase87), one a line, each with
                                      their role on the project if set. */}
                                  {c.team.length ? (
                                    <span className="teamcell">
                                      {c.team.map((t) => (
                                        <span className="lead" key={t.id}>
                                          <i style={{ background: "#6B7280" }}>{t.name.slice(0, 1).toUpperCase()}</i>
                                          {t.name}
                                          {roles?.[t.id] && <span className="lead-role">({roles[t.id]})</span>}
                                        </span>
                                      ))}
                                    </span>
                                  ) : (
                                    <span className="tdim">—</span>
                                  )}
                                </td>
                              );
                            case "status":
                              return (
                                <td key={key}>
                                  <span className="stg" style={{ background: color }}>
                                    {c.exception ? (
                                      exceptionLabel(c.exception)
                                    ) : (
                                      <>
                                        <span className="no">{c.stage}.</span>
                                        {stageLabel(c.stage, "continuous")}
                                      </>
                                    )}
                                  </span>
                                </td>
                              );
                            case "conceptRef":
                              return (
                                <td key={key} className="cellw">
                                  {c.concept || c.reference_urls?.length ? (
                                    <span className="copyc">
                                      {c.concept && <ClampText expanded={expandedRow === c.id} onToggle={() => toggleRow(c.id)}>{c.concept}</ClampText>}
                                      <ReferenceLinks urls={c.reference_urls ?? []} preview />
                                    </span>
                                  ) : (
                                    <span className="tdim">—</span>
                                  )}
                                </td>
                              );
                            case "finalCreative":
                              return (
                                <td key={key}>
                                  <CxCell
                                    column={FINAL_CREATIVE_COLUMN}
                                    value={c.cx?.["final_creative"] ?? null}
                                    onSave={(value) => onCxSave(c.id, "final_creative", value)}
                                    readOnly={cxReadOnly}
                                  />
                                </td>
                              );
                            case "imageOnText": {
                              // On the post itself (phase57), not versioned.
                              const lines = (c.slide_text ?? []).filter((t) => t.trim());
                              return (
                                <td key={key} className="cellw">
                                  {lines.length ? (
                                    <span className="copyc">
                                      <ClampText expanded={expandedRow === c.id} onToggle={() => toggleRow(c.id)}>{lines.join("\n")}</ClampText>
                                    </span>
                                  ) : (
                                    <span className="tdim">—</span>
                                  )}
                                </td>
                              );
                            }
                            case "copy": {
                              const rows = (copyVersionsByCreative?.[c.id] ?? [])
                                .map((v) => ({ versionNo: v.versionNo, text: copySummary(v.fields, postFormats(c)) }))
                                .filter((v) => v.text);
                              return (
                                <td key={key} className="cellw">
                                  <VersionedTextCell
                                    label="Copy"
                                    rows={rows}
                                    expanded={expandedRow === c.id}
                                    onToggle={() => toggleRow(c.id)}
                                  />
                                </td>
                              );
                            }
                            case "notes":
                              return (
                                <td key={key} className="cellw">
                                  <CxCell
                                    column={DESIGNER_NOTES_COLUMN}
                                    value={c.cx?.["designer_notes"] ?? null}
                                    onSave={(value) => onCxSave(c.id, "designer_notes", value)}
                                    readOnly={cxReadOnly}
                                  />
                                </td>
                              );
                            case "approach":
                              return (
                                <td key={key} className="cellw">
                                  {c.approach_notes?.length ? (
                                    <span className="copyc">
                                      <ClampText expanded={expandedRow === c.id} onToggle={() => toggleRow(c.id)}>
                                        {c.approach_notes.map((a) => `• ${a}`).join("\n")}
                                      </ClampText>
                                    </span>
                                  ) : (
                                    <span className="tdim">—</span>
                                  )}
                                </td>
                              );
                            case "principles":
                              return (
                                <td key={key}>
                                  <CxCell
                                    column={PRINCIPLES_COLUMN}
                                    value={c.cx?.["principles"] ?? null}
                                    onSave={(value) => onCxSave(c.id, "principles", value)}
                                    readOnly={cxReadOnly}
                                  />
                                </td>
                              );
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
            {stage} {stageLabel(stage, "continuous")}
          </span>
        ))}
      </div>

      {columnsPop.shown && (
        <ColumnsPopover
          anchorRect={columnsPop.shown}
          isOpen={columnsPop.isOpen}
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
