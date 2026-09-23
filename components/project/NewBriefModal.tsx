"use client";

import { useMemo, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { ListEditor } from "@/components/ui/ListEditor";
import { CxCell } from "@/components/project/CxCell";
import { useCreateCreative } from "@/hooks/use-create-creative";
import { useTeamMembers } from "@/hooks/use-team-members";
import { useMyAgency } from "@/hooks/use-my-agency";
import { useCustomColumns } from "@/hooks/use-custom-columns";
import { FORMAT_CATEGORIES, formatsByCategory } from "@/lib/formats";
import { errorMessage } from "@/lib/errors";

export function NewBriefModal({
  projectId,
  delivery,
  onClose,
  onCreated,
}: {
  projectId: string;
  delivery: "scheduled" | "continuous";
  onClose: () => void;
  // Fires with the new creative's scheduled_at right after a successful
  // create, before onClose — lets the caller (the calendar table, for
  // scheduled projects) jump to the month it actually landed in, rather
  // than leaving a brief invisible because it was briefed for a month the
  // view doesn't currently happen to be showing.
  onCreated?: (scheduledAt: string | null) => void;
}) {
  const { data: agency } = useMyAgency();
  const { data: teamMembers } = useTeamMembers(agency?.agencyId);
  const { data: customColumns } = useCustomColumns(projectId);
  const createCreative = useCreateCreative(projectId);

  const [name, setName] = useState("");
  const [category, setCategory] = useState<string>(FORMAT_CATEGORIES[0]);
  const formatsInCategory = useMemo(() => formatsByCategory(category), [category]);
  const [format, setFormat] = useState(formatsInCategory[0]?.id ?? "");
  const [leadUserId, setLeadUserId] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("09:00");
  const [destination, setDestination] = useState("");
  const [dueOn, setDueOn] = useState("");
  const [concept, setConcept] = useState("");
  const [referenceUrl, setReferenceUrl] = useState("");
  const [slideText, setSlideText] = useState<string[]>([]);
  const [caption, setCaption] = useState("");
  const [approachNotes, setApproachNotes] = useState<string[]>([]);
  const [cx, setCx] = useState<Record<string, string | number | boolean | null>>({});

  const [nameError, setNameError] = useState<string | null>(null);
  // Field-level, checked before submit — the DB's own
  // check_creative_delivery_fields trigger is the backstop, not the first
  // thing a user meets (verified empirically: it rejects a missing
  // scheduled_at/destination outright, but with a raw Postgres message).
  const [dateError, setDateError] = useState<string | null>(null);
  const [destinationError, setDestinationError] = useState<string | null>(null);

  function handleCategoryChange(next: string) {
    setCategory(next);
    setFormat(formatsByCategory(next)[0]?.id ?? "");
  }

  async function handleSubmit() {
    if (!name.trim()) {
      setNameError("Give the brief a name.");
      return;
    }
    setNameError(null);

    if (delivery === "scheduled" && !date) {
      setDateError("Pick a publish date.");
      return;
    }
    setDateError(null);

    if (delivery === "continuous" && !destination.trim()) {
      setDestinationError("Say where this goes.");
      return;
    }
    setDestinationError(null);

    const scheduledAt =
      delivery === "scheduled"
        ? new Date(`${date}T${time || "09:00"}:00`).toISOString()
        : null;

    await createCreative.mutateAsync({
      name: name.trim(),
      format,
      leadUserId: leadUserId || null,
      concept,
      referenceUrl,
      approachNotes,
      slideText,
      caption,
      cx,
      scheduledAt,
      destination: delivery === "continuous" ? destination.trim() : null,
      dueOn: delivery === "continuous" ? dueOn || null : null,
    });
    onCreated?.(scheduledAt);
    onClose();
  }

  const submitError = createCreative.error
    ? errorMessage(createCreative.error, "Couldn't create the brief")
    : null;

  return (
    <Modal
      title="New Brief"
      onClose={onClose}
      footer={
        <>
          <div className="grow" />
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={createCreative.isPending}
            onClick={handleSubmit}
          >
            {createCreative.isPending ? "Creating…" : "Create Brief"}
          </button>
        </>
      }
    >
      <div className="field">
        <label htmlFor="nbName">What Is It Called?</label>
        <input
          id="nbName"
          className="bin one"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (nameError) setNameError(null);
          }}
          placeholder="e.g. Trials countdown — 3 days"
        />
        {nameError && <p className="autherr">{nameError}</p>}
      </div>

      <div className="frow">
        <div className="field">
          <label htmlFor="nbCat">Content Type</label>
          <select
            id="nbCat"
            className="bin one"
            value={category}
            onChange={(e) => handleCategoryChange(e.target.value)}
          >
            {FORMAT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="nbFmt">Format</label>
          <select
            id="nbFmt"
            className="bin one"
            value={format}
            onChange={(e) => setFormat(e.target.value)}
          >
            {formatsInCategory.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {delivery === "scheduled" ? (
        <div className="frow">
          <div className="field">
            <label htmlFor="nbDate">Publish Date</label>
            <input
              id="nbDate"
              className="bin one"
              type="date"
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                if (dateError) setDateError(null);
              }}
            />
            {dateError && <p className="autherr">{dateError}</p>}
          </div>
          <div className="field">
            <label htmlFor="nbTime">Time</label>
            <input
              id="nbTime"
              className="bin one"
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
            />
          </div>
        </div>
      ) : (
        <div className="frow">
          <div className="field">
            <label htmlFor="nbDest">Destination</label>
            <input
              id="nbDest"
              className="bin one"
              value={destination}
              onChange={(e) => {
                setDestination(e.target.value);
                if (destinationError) setDestinationError(null);
              }}
              placeholder="ASIN, URL or location"
            />
            {destinationError && <p className="autherr">{destinationError}</p>}
          </div>
          <div className="field">
            <label htmlFor="nbDue">Needed By</label>
            <input
              id="nbDue"
              className="bin one"
              type="date"
              value={dueOn}
              onChange={(e) => setDueOn(e.target.value)}
            />
          </div>
        </div>
      )}

      <div className="field">
        <label htmlFor="nbLead">Lead</label>
        <select
          id="nbLead"
          className="bin one"
          value={leadUserId}
          onChange={(e) => setLeadUserId(e.target.value)}
        >
          <option value="">Unassigned</option>
          {(teamMembers ?? []).map((m) => (
            <option key={m.user_id} value={m.user_id}>
              {m.user?.name ?? "—"}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label htmlFor="nbConcept">Concept — What Is Being Made and Why</label>
        <textarea
          id="nbConcept"
          className="bin"
          rows={4}
          value={concept}
          onChange={(e) => setConcept(e.target.value)}
          placeholder="What the piece says, who it is for, what it is answering, and how it should look."
        />
      </div>

      <div className="field">
        <label htmlFor="nbRef">
          Reference Link <span className="bnote">optional</span>
        </label>
        <input
          id="nbRef"
          className="bin one"
          value={referenceUrl}
          onChange={(e) => setReferenceUrl(e.target.value)}
          placeholder="A post, article or page this is modelled on"
        />
      </div>

      <ListEditor
        label="Text on Image"
        itemLabel={(i) => `Slide ${i + 1}`}
        values={slideText}
        onChange={setSlideText}
      />

      <div className="field">
        <label htmlFor="nbCaption">Caption</label>
        <textarea
          id="nbCaption"
          className="bin"
          rows={3}
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          placeholder="Caption or body copy"
        />
      </div>

      {customColumns && customColumns.length > 0 && (
        <div className="field">
          <label>Project Fields</label>
          {customColumns.map((col) => (
            <div className="brow" key={col.id}>
              <b>{col.label}</b>
              <CxCell
                column={col}
                value={cx[col.key] ?? null}
                onSave={(value) => setCx((prev) => ({ ...prev, [col.key]: value }))}
              />
            </div>
          ))}
        </div>
      )}

      <ListEditor
        label="Approach — What the Reader Gets"
        itemLabel={(i) => `Note ${i + 1}`}
        values={approachNotes}
        onChange={setApproachNotes}
      />

      {submitError && <p className="autherr">{submitError}</p>}
    </Modal>
  );
}
