"use client";

import { use, useState } from "react";
import { useClientDetail } from "@/hooks/use-client";
import { useIsStaff } from "@/hooks/use-is-staff";
import { useMonthlyStrategies, useSaveMonthlyStrategy, type MonthlyStrategyRow } from "@/hooks/use-monthly-strategy";
import { SettingsHead } from "@/components/settings/SettingsHead";
import { STRATEGY_FIELDS, addMonths, filledFields, monthLabel, monthOf, type StrategyFields } from "@/lib/monthly-strategy";
import { errorMessage } from "@/lib/errors";

// Client Settings → Knowledge → Strategy (direct instruction, phase78): the
// strategy decided for each month, which Draft with Frank follows for posts
// going live that month. This month and the next two, then any earlier
// month with something in it, each folding open; this month starts open.
// The team writes it; a client's own people read it.
export default function ClientStrategyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: client } = useClientDetail(id);
  const { data: rows, isLoading, isError, dataUpdatedAt } = useMonthlyStrategies(id);
  const { isStaff, isPending: isStaffPending } = useIsStaff();
  const canEdit = isStaff && !isStaffPending;

  const now = monthOf(new Date(dataUpdatedAt || 0));
  const ahead = [now, addMonths(now, 1), addMonths(now, 2)];
  const earlier = (rows ?? []).map((r) => r.month).filter((m) => m < now && filledFields(rows!.find((r) => r.month === m)).length);
  const months = [...ahead, ...earlier];

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
        <div style={{ marginTop: 24 }}>
          {months.map((m) => (
            <StrategyMonth
              key={m}
              clientId={id}
              month={m}
              current={m === now}
              row={rows?.find((r) => r.month === m) ?? null}
              canEdit={canEdit}
            />
          ))}
        </div>
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
              {save.error && <p className="autherr">{errorMessage(save.error, "Couldn't save the strategy")}</p>}
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
