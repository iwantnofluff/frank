"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { useCreateProject } from "@/hooks/use-create-project";
import { PROJECT_TYPE_OPTS } from "@/lib/project-types";
import { errorMessage } from "@/lib/errors";
import { useSetProjectColumns } from "@/hooks/use-set-project-columns";
import { AddColumnForm, type ColumnSpec } from "@/components/project/AddColumnForm";
import { TOGGLABLE_COLUMNS as SCHEDULED_COLUMNS } from "@/components/project/ProjectCalendarTable";
import { TOGGLABLE_COLUMNS as CONTINUOUS_COLUMNS } from "@/components/project/ContinuousCalendarTable";
import { ColumnEditor } from "@/components/project/ColumnEditor";
import { columnTypeLabel, customTypeLabel } from "@/lib/column-types";

type Delivery = "scheduled" | "continuous";

// Ports frank-prototype.html's #newScrim/#newProjBtn2 (New Project, not the
// New Brief modal — that's #briefScrim/NewBriefModal.tsx, a different
// scrim). On create, the prototype opens the new project's calendar
// (openProject) — this app's equivalent landing spot is the project page
// itself, so navigates there the same way.
export function NewProjectModal({
  clientId,
  onClose,
}: {
  clientId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const createProject = useCreateProject();

  const [name, setName] = useState("");
  const [delivery, setDelivery] = useState<Delivery>("scheduled");
  const [type, setType] = useState(PROJECT_TYPE_OPTS.scheduled[0]);
  const [nameError, setNameError] = useState<string | null>(null);
  // The second step, Columns (phase96, direct instruction): every column
  // ticked; unticked ones are hidden in the Main Table. Columns of the
  // project's own are added here too, kept until the project is made.
  const [step, setStep] = useState<"details" | "columns">("details");
  const setColumns = useSetProjectColumns();
  const builtIn = delivery === "scheduled" ? SCHEDULED_COLUMNS : CONTINUOUS_COLUMNS;
  const builtInLabels: Record<string, string> = Object.fromEntries(builtIn.map((c) => [c.key, c.label]));
  // The step's columns: their order (built-in keys and "new:<n>" for ones
  // added here), which are unticked, any renamed, and the added ones.
  const [order, setOrder] = useState<string[]>(() => SCHEDULED_COLUMNS.map((c) => c.key));
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [added, setAdded] = useState<Record<string, ColumnSpec>>({});
  const [nextNew, setNextNew] = useState(1);

  function handleDeliveryChange(next: Delivery) {
    setDelivery(next);
    setType(PROJECT_TYPE_OPTS[next][0]);
    // The other kind of project has its own columns.
    setOrder((next === "scheduled" ? SCHEDULED_COLUMNS : CONTINUOUS_COLUMNS).map((c) => c.key));
    setHidden(new Set());
    setLabels({});
    setAdded({});
  }

  function next() {
    if (!name.trim()) {
      setNameError("Give it a name first.");
      return;
    }
    setNameError(null);
    setStep("columns");
  }

  async function handleSubmit() {

    const project = await createProject.mutateAsync({
      clientId,
      name: name.trim(),
      type,
      delivery,
    });
    await setColumns.mutateAsync({
      projectId: project.id,
      order,
      hidden: [...hidden],
      labels,
      added,
      builtInLabels,
    });
    onClose();
    router.push(`/projects/${project.id}`);
  }

  const submitError = createProject.error
    ? errorMessage(createProject.error, "Couldn't create the project")
    : setColumns.error
      ? errorMessage(setColumns.error, "The project was made, but its columns weren't saved")
      : null;
  const pending = createProject.isPending || setColumns.isPending;
  const shownCount = order.filter((k) => !hidden.has(k)).length;

  return (
    <Modal hideCloseButton
      title="New Project"
      size={step === "columns" ? "lg" : "sm"}
      onClose={onClose}
      footer={
        step === "details" ? (
          <>
            <div className="grow" />
            <button type="button" className="btn" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="btn primary" onClick={next}>
              Next
            </button>
          </>
        ) : (
          <>
            <span className="grow">
              {shownCount} of {order.length} columns shown
            </span>
            <button type="button" className="btn" onClick={() => setStep("details")}>
              Back
            </button>
            <button type="button" className="btn primary" disabled={pending} onClick={handleSubmit}>
              {pending ? "Creating…" : "Create"}
            </button>
          </>
        )
      }
    >
      {step === "columns" ? (
        <>
          <p className="sub" style={{ marginTop: 0 }}>
            The columns in this project&rsquo;s table: drag to reorder, rename any, untick any it doesn&rsquo;t need
            (a saved view can still show them later), or add its own. This becomes the project&rsquo;s table.
          </p>
          <ColumnEditor
            columns={order.map((key) => ({
              key,
              label: labels[key] ?? builtInLabels[key] ?? added[key]?.label ?? key,
              typeLabel: added[key] ? customTypeLabel(added[key].type) : columnTypeLabel(key),
            }))}
            hidden={hidden}
            onToggle={(key) =>
              setHidden((prev) => {
                const next = new Set(prev);
                if (next.has(key)) next.delete(key);
                else next.add(key);
                return next;
              })
            }
            onReorder={setOrder}
            onRename={(key, label) => setLabels((prev) => ({ ...prev, [key]: label }))}
            onRemove={(key) => {
              setOrder((prev) => prev.filter((k) => k !== key));
              setAdded((prev) => {
                const next = { ...prev };
                delete next[key];
                return next;
              });
            }}
          />
          <AddColumnForm
            onAdd={(column) => {
              const key = `new:${nextNew}`;
              setNextNew((n) => n + 1);
              setAdded((prev) => ({ ...prev, [key]: column }));
              setOrder((prev) => [...prev, key]);
            }}
          />
          {submitError && <p className="autherr">{submitError}</p>}
        </>
      ) : (
      <>
      <div className="field">
        <label htmlFor="newName">Project name</label>
        <input
          id="newName"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (nameError) setNameError(null);
          }}
          placeholder={
            delivery === "scheduled" ? "e.g. Social Media Management" : "e.g. Amazon A+"
          }
        />
        {nameError && <p className="autherr">{nameError}</p>}
      </div>

      <div className="field">
        <label htmlFor="newType">Type</label>
        <select id="newType" value={type} onChange={(e) => setType(e.target.value)}>
          {PROJECT_TYPE_OPTS[delivery].map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label>How does this work get delivered?</label>
        <div className="kindpick">
          <button
            type="button"
            className="kopt"
            aria-pressed={delivery === "scheduled"}
            onClick={() => handleDeliveryChange("scheduled")}
          >
            <span className="kic">
              <svg viewBox="0 0 24 24">
                <rect x="3" y="5" width="18" height="16" rx="2" />
                <path d="M3 10h18M8 3v4M16 3v4" />
              </svg>
            </span>
            <span className="kt">
              <b>Content Planner</b>
              <span>
                Goes live on a date. You get Week, Month and Calendar views with a publish date
                on every piece.
              </span>
              <span className="keg">Social Media · Paid Campaigns</span>
            </span>
          </button>
          <button
            type="button"
            className="kopt"
            aria-pressed={delivery === "continuous"}
            onClick={() => handleDeliveryChange("continuous")}
          >
            <span className="kic">
              <svg viewBox="0 0 24 24">
                <path d="M4 6h16M4 12h16M4 18h10" />
                <path d="M17 16l2 2 4-4" />
              </svg>
            </span>
            <span className="kt">
              <b>Other Content</b>
              <span>
                Approved then handed over. You get a list ordered by what is due, by
                its Live Date.
              </span>
              <span className="keg">Amazon A+ · Website · Emailers · Print and Events</span>
            </span>
          </button>
        </div>
      </div>

      </>
      )}
    </Modal>
  );
}
