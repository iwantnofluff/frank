"use client";

import { use, useState } from "react";
import { useClientDetail } from "@/hooks/use-client";
import { useIsStaff } from "@/hooks/use-is-staff";
import {
  useAddStrategyMonth,
  useArchiveStrategyMonth,
  useMonthlyStrategies,
  useSaveMonthlyStrategy,
  type MonthlyStrategyRow,
} from "@/hooks/use-monthly-strategy";
import { SettingsHead } from "@/components/settings/SettingsHead";
import { STRATEGY_FIELDS, addMonths, filledFields, monthLabel, monthOf, type StrategyFields } from "@/lib/monthly-strategy";
import { errorMessage } from "@/lib/errors";

// Client Settings → Knowledge → Strategy (direct instruction, phase78): the
// strategy decided for each month, which Draft with Frank follows for posts
// going live that month. The months someone has added (Add Month), Active
// or Archived like a client's projects (phase79; archiving only tidies the
// list, drafting still follows it), each folding open, this month open.
// The team writes it; a client's own people read it.
export default function ClientStrategyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: client } = useClientDetail(id);
  const { data: rows, isLoading, isError, dataUpdatedAt } = useMonthlyStrategies(id);
  const { isStaff, isPending: isStaffPending } = useIsStaff();
  const canEdit = isStaff && !isStaffPending;

  const [tab, setTab] = useState<"active" | "archived">("active");
  const add = useAddStrategyMonth(id);
  const now = monthOf(new Date(dataUpdatedAt || 0));
  const active = (rows ?? []).filter((r) => !r.archived_at).sort((a, b) => a.month.localeCompare(b.month));
  const archived = (rows ?? []).filter((r) => r.archived_at).sort((a, b) => b.month.localeCompare(a.month));
  const shown = tab === "active" ? active : archived;
  // Add Month offers the next twelve months not added yet, this one first.
  const taken = new Set((rows ?? []).map((r) => r.month));
  const addable = Array.from({ length: 12 }, (_, i) => addMonths(now, i)).filter((m) => !taken.has(m));

  return (
    <div className="pad narrow">
      <SettingsHead
        title="Strategy"
        description={`What's been decided for ${client?.name ?? "this client"} each month. Draft with Frank follows the month a post goes live in; empty fields are left out.`}
      />
      {isError && (
        <div className="empty">
          <b>Couldn&rsquo;t load the strategy</b>
        </div>
      )}
      {!isError && !isLoading && (
        <>
          <div className="secthead" style={{ marginTop: 24 }}>
            <h2>Months</h2>
            <div className="filters">
              <button className="chip" type="button" aria-pressed={tab === "active"} onClick={() => setTab("active")}>
                Active ({active.length})
              </button>
              <button className="chip" type="button" aria-pressed={tab === "archived"} onClick={() => setTab("archived")}>
                Archived ({archived.length})
              </button>
              {canEdit && <span className="toolsep" />}
              {canEdit && (
                <select
                  className="btn sm addmonth"
                  aria-label="Add Month"
                  value=""
                  disabled={add.isPending || addable.length === 0}
                  onChange={(e) => {
                    if (!e.target.value) return;
                    setTab("active");
                    add.mutate(e.target.value);
                  }}
                >
                  <option value="" disabled>
                    {add.isPending ? "Adding…" : "Add Month"}
                  </option>
                  {addable.map((m) => (
                    <option key={m} value={m}>
                      {monthLabel(m)}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>
          {add.error && <p className="autherr">{errorMessage(add.error, "Couldn't add the month")}</p>}
          {shown.length === 0 ? (
            <div className="empty">
              <b>{tab === "active" ? "No months yet" : "No archived months"}</b>
              <span>
                {tab === "archived"
                  ? "Nothing has been archived yet."
                  : canEdit
                    ? "Add a month to write down what's been decided for it."
                    : "Nothing has been decided here yet."}
              </span>
            </div>
          ) : (
            shown.map((r) => (
              <StrategyMonth key={r.id} clientId={id} month={r.month} current={r.month === now} row={r} canEdit={canEdit} />
            ))
          )}
        </>
      )}
    </div>
  );
}

const EMPTY: StrategyFields = { objective: null, key_messages: null, themes: null, offers: null, key_dates: null, notes: null };

function StrategyMonth({
  clientId,
  month,
  current,
  row,
  canEdit,
}: {
  clientId: string;
  month: string;
  current: boolean;
  row: MonthlyStrategyRow | null;
  canEdit: boolean;
}) {
  const [open, setOpen] = useState(current);
  const saved: StrategyFields = row ?? EMPTY;
  const [draft, setDraft] = useState<StrategyFields>(saved);
  const save = useSaveMonthlyStrategy(clientId);
  const archive = useArchiveStrategyMonth(clientId);
  const filled = filledFields(row).length;
  const changed = STRATEGY_FIELDS.some((f) => (draft[f.key] ?? "").trim() !== (saved[f.key] ?? "").trim());

  return (
    <div className="panel strat" id={`strategy-${month.slice(0, 7)}`}>
      <button type="button" className="panel-h strat-h" aria-expanded={open} onClick={() => setOpen(!open)}>
        <b>{monthLabel(month)}</b>
        {current && <span className="tag blue">This month</span>}
        <span className="strat-count">
          {filled ? `${filled} of ${STRATEGY_FIELDS.length} filled` : "Nothing yet"}
        </span>
        <svg className="strat-chev" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div className="strat-b">
          {STRATEGY_FIELDS.map((f) =>
            canEdit ? (
              <label className="field" key={f.key}>
                <span>{f.label}</span>
                <textarea
                  className="bin"
                  rows={2}
                  placeholder={f.hint}
                  value={draft[f.key] ?? ""}
                  onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
                />
              </label>
            ) : (
              <div className="strat-read" key={f.key}>
                <span>{f.label}</span>
                <p className={saved[f.key]?.trim() ? "" : "muted"}>{saved[f.key]?.trim() || "Nothing yet."}</p>
              </div>
            ),
          )}
          {canEdit && (
            <div className="strat-f">
              {row && (
                <button
                  type="button"
                  className="btn sm strat-archive"
                  disabled={archive.isPending}
                  onClick={() => archive.mutate({ id: row.id, archive: !row.archived_at })}
                >
                  {row.archived_at ? "Unarchive" : "Archive"}
                </button>
              )}
              {(save.error || archive.error) && (
                <p className="autherr">{errorMessage(save.error ?? archive.error, "Couldn't save the strategy")}</p>
              )}
              <button
                type="button"
                className="btn primary sm"
                disabled={!changed || save.isPending}
                onClick={() => save.mutate({ month, fields: draft })}
              >
                {save.isPending ? "Saving…" : changed ? `Save ${monthLabel(month)}` : "Saved"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
