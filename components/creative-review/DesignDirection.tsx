"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Modal } from "@/components/ui/Modal";
import {
  useChooseDesignDirection,
  useDesignDirections,
  useRequestDesignDirection,
  type DesignDirectionRef,
  type DesignDirectionRow,
} from "@/hooks/use-design-directions";
import { parsePartialDesignDirection, type DesignDirection as Body, type DesignDirectionOption } from "@/lib/ai/design-direction";
import { useReferenceImages } from "@/hooks/use-reference-images";
import { errorMessage } from "@/lib/errors";
import { useMyAgency } from "@/hooks/use-my-agency";
import { useClientDetail } from "@/hooks/use-client";
import { useClientPreferences } from "@/hooks/use-client-preferences";
import { feedbackReach } from "@/lib/ai/copy-chat-context";

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

// A reference's preview image, gone quietly when the site no longer serves
// it (Instagram's expire).
function RefThumb({ src }: { src: string | null }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <div className="ddir-thumb empty">No image</div>;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- the linked site's own preview image
    <img className="ddir-thumb" src={src} alt="" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
  );
}

function List({ items }: { items: string[] }) {
  return (
    <ul className="ddir-list">
      {items.map((t, i) => (
        <li key={i}>{t}</li>
      ))}
    </ul>
  );
}

// Design with Frank (phase110): Frank reads the post's concept and its
// reference links, and writes the designer a direction: what the
// references teach, two or three ways to design this post, and guardrails.
// Use This puts a direction into the post's Design Direction box (and each
// slide's line into its Notes for Designer), and marks it as chosen. Kept with the post, for the team.
// Portalled to the page: it opens over the post window.
export function DesignDirection({
  creativeId,
  newPost,
  unsavedRuns,
  onUnsavedRunsChange,
  postName,
  clientId,
  concept,
  referenceUrls,
  slideCount,
  frameNoun,
  isVideo,
  notes,
  notesHome,
  onUse,
  onClose,
}: {
  // Null on a post not yet made (direct instruction: Save Concept locks
  // the concept in before Create Post): then its project, name, formats
  // and pasted images go with each request, and the directions stay in
  // unsavedRuns, kept by the post's window until Create Post saves them.
  creativeId: string | null;
  newPost: { projectId: string; name: string; formats: string[]; images: File[] } | null;
  unsavedRuns: DesignDirectionRow[];
  onUnsavedRunsChange: (runs: DesignDirectionRow[]) => void;
  postName: string;
  clientId: string | null;
  // The brief as it is in the window, saved or not.
  concept: string;
  referenceUrls: string[];
  slideCount: number | null;
  frameNoun: string;
  isVideo: boolean;
  // The window's Notes for Designer, for Rework My Notes.
  notes: { overall: string; slides: string[] };
  // Where Use This puts a direction, in words, for the note under it.
  notesHome: string;
  // A direction into the notes, or null to put back what was there.
  onUse: (direction: DesignDirectionOption | null, guardrails?: Body["guardrails"]) => void;
  onClose: () => void;
}) {
  const { data: savedRows, isLoading: loadingSaved } = useDesignDirections(creativeId);
  const rows = [...unsavedRuns, ...(savedRows ?? [])];
  const isLoading = !!creativeId && loadingSaved;
  const request = useRequestDesignDirection(creativeId);
  const choose = useChooseDesignDirection(creativeId ?? "");
  // A new post's pasted images, shown from this computer.
  const newImages = newPost?.images;
  const newImageUrls = useMemo(() => (newImages ?? []).map((f) => URL.createObjectURL(f)), [newImages]);
  useEffect(() => () => newImageUrls.forEach((u) => URL.revokeObjectURL(u)), [newImageUrls]);
  const { data: agency } = useMyAgency();
  const { data: client } = useClientDetail(clientId ?? "");
  const { data: prefs } = useClientPreferences(clientId);
  const theirs = client?.name ? `${client.name}’s` : "the client’s";
  const [openId, setOpenId] = useState<string | null>(null);
  const [skipped, setSkipped] = useState<string[]>([]);
  const row: DesignDirectionRow | undefined = rows.find((r) => r.id === openId) ?? rows[0];
  const { data: pastedImages } = useReferenceImages(creativeId);
  const pastedUrl = (ref: DesignDirectionRef) =>
    ref.pendingIndex !== undefined
      ? (newImageUrls[ref.pendingIndex] ?? null)
      : (pastedImages?.find((p) => p.storageKey === ref.assetKey)?.url ?? null);
  const canAsk = !!concept.trim() || referenceUrls.length > 0 || !!pastedImages?.length || !!newPost?.images.length;
  // While Frank writes (direct instruction: shown as it's written): the
  // references it's reading, and what it has written so far.
  const [progress, setProgress] = useState<{ refs: DesignDirectionRef[]; text: string }>({ refs: [], text: "" });
  const shown: { body: Body; refs: DesignDirectionRef[]; chosen: number | null; live: boolean } | null = request.isPending
    ? { body: parsePartialDesignDirection(progress.text, slideCount, isVideo), refs: progress.refs, chosen: null, live: true }
    : row
      ? { body: row.body, refs: row.refs, chosen: row.chosen, live: false }
      : null;

  const hasNotes = !!notes.overall.trim() || notes.slides.some((t) => t.trim());

  function ask(mode: "concept" | "rework") {
    setProgress({ refs: [], text: "" });
    request.mutate(
      { concept, referenceUrls, slideCount, newPost: newPost ?? undefined, mode, notes, onProgress: setProgress },
      {
        onSuccess: (r) => {
          setSkipped(r.skippedFiles);
          if (r.id) return setOpenId(r.id);
          if (!r.direction) return;
          // Kept by the window until Create Post.
          const run: DesignDirectionRow = {
            id: crypto.randomUUID(),
            body: r.direction,
            refs: r.refs ?? [],
            chosen: null,
            created_at: new Date().toISOString(),
            author: "You",
          };
          onUnsavedRunsChange([run, ...unsavedRuns]);
          setOpenId(run.id);
        },
      },
    );
  }

  function use(i: number) {
    if (!row) return;
    const added = row.chosen === i;
    if (unsavedRuns.some((r) => r.id === row.id)) {
      onUnsavedRunsChange(unsavedRuns.map((r) => (r.id === row.id ? { ...r, chosen: added ? null : i } : r)));
    } else {
      choose.mutate({ id: row.id, chosen: added ? null : i });
    }
    onUse(added ? null : row.body.directions[i], row.body.guardrails);
  }

  const body = (
    <Modal
      title={
        <>
          <div className="modal-title-project">Design with Frank</div>
          <div className="modal-title-post">{postName}</div>
        </>
      }
      ariaLabel="Design with Frank"
      size="lg"
      onClose={onClose}
      footer={
        <>
          <span className="grow">
            {newPost ? "Kept with the post when you Create Post. " : ""}Each direction uses one of {agency?.name ? `${agency.name}’s` : "the workspace’s"} monthly AI requests.
          </span>
          <button type="button" className="btn" onClick={onClose}>
            Close
          </button>
        </>
      }
    >
      <div className="cchat">
        <div className="cchat-side">
          {/* Two ways in, as Draft with Frank's (direct instruction): a
              direction from the Concept alone, or a rework of the notes. */}
          <button
            type="button"
            className="btn primary sm"
            disabled={request.isPending || !canAsk}
            title={canAsk ? undefined : "Write a concept or add a reference first"}
            onClick={() => ask("concept")}
          >
            Direction from the Concept
          </button>
          <button
            type="button"
            className="btn sm"
            disabled={request.isPending || !hasNotes}
            title={hasNotes ? undefined : "Write some Notes for Designer first"}
            onClick={() => ask("rework")}
          >
            Rework My Notes
          </button>
          <div className="cchat-head">Frank reads</div>
          <div className="cchat-note">
            <ul className="cchat-reads">
              <li>This post&rsquo;s Concept, format, WIIFM and Text on Image, as they are in the window.</li>
              <li>For a rework, your Notes for Designer as they are in the window: kept where they work, sharpened where they don&rsquo;t.</li>
              <li>
                Each reference link&rsquo;s page and preview image, up to 8, and the images pasted into References. A public
                Instagram post&rsquo;s likes and comments show which did best.
              </li>
              <li>Each format&rsquo;s direction, and {theirs} strategy for the month.</li>
              <li>Your workspace&rsquo;s and {theirs} Knowledge: notes in full, and up to 10 PDFs or images.</li>
              <li>
                {!prefs || prefs.frank_feedback === "off"
                  ? `Not ${theirs} comments: off in ${theirs} Preferences.`
                  : `${theirs.charAt(0).toUpperCase() + theirs.slice(1)} own comments ${feedbackReach(prefs.frank_feedback)}, for what to avoid.`}
              </li>
            </ul>
          </div>
          {rows.length > 0 && (
            <>
              <div className="cchat-head">Earlier directions</div>
              <div className="cchat-pastlist">
                {rows.map((r) => (
                  <button
                    type="button"
                    key={r.id}
                    className="cchat-past"
                    aria-pressed={r.id === row?.id}
                    onClick={() => setOpenId(r.id)}
                  >
                    <b>{r.body.mode === "rework" ? "Reworked the notes" : "From the Concept"}</b>
                    <span>{r.body.directions.map((d) => d.title).join(", ")}</span>
                    <span>
                      {r.author ?? "Someone"} · {when(r.created_at)}
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="cchat-main ddir" aria-live="polite">
          {!shown ? (
            <div className="cchat-empty">
              {isLoading
                ? "Loading…"
                : "Start with a direction from the Concept, or ask Frank to rework your Notes for Designer."}
            </div>
          ) : (
            <>
              {shown.body.summary && <p className="ddir-summary">{shown.body.summary}</p>}

              {shown.refs.length > 0 && (
                <section>
                  <div className="cchat-head">What the references teach</div>
                  <div className="ddir-refs">
                    {shown.refs.map((ref) => {
                      const lessons = shown.body.references.find((r) => r.n === ref.n)?.lessons ?? [];
                      return (
                        <div className="ddir-ref" key={ref.n}>
                          {ref.url ? (
                            <a href={ref.url} target="_blank" rel="noreferrer" aria-label={`Open reference ${ref.n}`}>
                              <RefThumb src={ref.image} />
                            </a>
                          ) : (
                            <RefThumb src={pastedUrl(ref)} />
                          )}
                          <div className="ddir-ref-b">
                            <div className="ddir-ref-h">
                              <b>Reference {ref.n}</b>
                              {ref.title && <span>{ref.title}</span>}
                            </div>
                            {lessons.length ? (
                              <List items={lessons} />
                            ) : (
                              <p className="cchat-note">
                                {shown.live
                                  ? "Reading\u2026"
                                  : ref.read
                                    ? "Nothing particular to take from this one."
                                    : ref.url
                                      ? "Couldn\u2019t be read: the page needs a sign-in or refused."
                                      : "Too large to include this time."}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {shown.body.worked.length > 0 && (
                <section>
                  <div className="cchat-head">What has worked</div>
                  <List items={shown.body.worked} />
                </section>
              )}

              <section>
                <div className="cchat-head">Directions</div>
                <p className="cchat-note">Use This puts a direction into {notesHome}.</p>
                {shown.body.directions.map((d, i) => {
                  const added = shown.chosen === i;
                  return (
                    <div className="cchat-draft ddir-dir" key={i}>
                      <div className="cchat-draft-h">
                        <b>{d.title}</b>
                        {!shown.live && <button
                          type="button"
                          className={`btn sm${added ? " added" : ""}`}
                          aria-pressed={added}
                          aria-label={added ? `Added: ${d.title}` : `Use This: ${d.title}`}
                          disabled={choose.isPending}
                          onClick={() => use(i)}
                        >
                          {added ? "Added" : "Use This"}
                        </button>}
                      </div>
                      <dl className="ddir-fields">
                        {(
                          [
                            ["Idea", d.idea],
                            ["Layout", d.layout],
                            ["Style", d.style],
                            ["Palette", d.palette],
                            ["Text on Image", d.textOnImage],
                          ] as const
                        ).map(([label, text]) =>
                          text ? (
                            <div key={label}>
                              <dt>{label}</dt>
                              <dd>{text}</dd>
                            </div>
                          ) : null,
                        )}
                        {d.slides.length > 0 && (
                          <div>
                            <dt>By {frameNoun.toLowerCase()}</dt>
                            <dd>
                              <ol className="ddir-slides">
                                {d.slides.map((s, k) => (
                                  <li key={k}>{s}</li>
                                ))}
                              </ol>
                            </dd>
                          </div>
                        )}
                        {isVideo && d.reel && (
                          <>
                            {d.reel.hook && (
                              <div>
                                <dt>First three seconds</dt>
                                <dd>{d.reel.hook}</dd>
                              </div>
                            )}
                            {d.reel.shots.length > 0 && (
                              <div>
                                <dt>Shots</dt>
                                <dd>
                                  <ol className="ddir-slides">
                                    {d.reel.shots.map((s, k) => (
                                      <li key={k}>{s}</li>
                                    ))}
                                  </ol>
                                </dd>
                              </div>
                            )}
                            {d.reel.end && (
                              <div>
                                <dt>End frame</dt>
                                <dd>{d.reel.end}</dd>
                              </div>
                            )}
                          </>
                        )}
                      </dl>
                    </div>
                  );
                })}
              </section>

              {(shown.body.guardrails.format.length > 0 ||
                shown.body.guardrails.client.length > 0 ||
                shown.body.guardrails.avoid.length > 0) && (
                <section>
                  <div className="cchat-head">Guardrails</div>
                  <div className="ddir-guard">
                    {shown.body.guardrails.format.length > 0 && (
                      <div>
                        <b>The format</b>
                        <List items={shown.body.guardrails.format} />
                      </div>
                    )}
                    {shown.body.guardrails.client.length > 0 && (
                      <div>
                        <b>{client?.name ? `${client.name}’s brand` : "The brand"}</b>
                        <List items={shown.body.guardrails.client} />
                      </div>
                    )}
                    {shown.body.guardrails.avoid.length > 0 && (
                      <div>
                        <b>Avoid</b>
                        <List items={shown.body.guardrails.avoid} />
                      </div>
                    )}
                  </div>
                </section>
              )}
              {shown.live ? (
                <div className="cchat-msg assistant pending" role="status">
                  <div className="cchat-who">Frank</div>
                  <div className="cchat-thinking">
                    {progress.text ? "Frank is writing" : "Frank is reading the references"}
                    <span className="cchat-dots" aria-hidden="true">
                      <i />
                      <i />
                      <i />
                    </span>
                  </div>
                </div>
              ) : (
                row && (
                  <p className="cchat-note">
                    {row.author ?? "Someone"} asked Frank · {when(row.created_at)}
                  </p>
                )
              )}
            </>
          )}
          {request.error && <p className="autherr">{errorMessage(request.error, "Frank didn't answer")}</p>}
          {choose.error && <p className="autherr">{errorMessage(choose.error, "Couldn't mark this direction")}</p>}
          {skipped.length > 0 && <p className="cchat-note">Too large to include this time: {skipped.join(", ")}.</p>}
        </div>
      </div>
    </Modal>
  );
  return createPortal(body, document.body);
}
