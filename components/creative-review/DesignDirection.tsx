"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { Modal } from "@/components/ui/Modal";
import {
  useChooseDesignDirection,
  useDesignDirections,
  useRequestDesignDirection,
  type DesignDirectionRow,
} from "@/hooks/use-design-directions";
import type { DesignDirectionOption } from "@/lib/ai/design-direction";
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
// Use This puts a direction into Notes for Designer, and marks it as the
// one chosen for the post page. Kept with the post, for the team.
// Portalled to the page: it opens over the post window.
export function DesignDirection({
  creativeId,
  postName,
  clientId,
  concept,
  referenceUrls,
  slideCount,
  frameNoun,
  isVideo,
  notesHome,
  onUse,
  onClose,
}: {
  creativeId: string;
  postName: string;
  clientId: string | null;
  // The brief as it is in the window, saved or not.
  concept: string;
  referenceUrls: string[];
  slideCount: number | null;
  frameNoun: string;
  isVideo: boolean;
  // Where Use This puts a direction, in words, for the note under it;
  // null when the post has no Notes for Designer to fill.
  notesHome: string | null;
  // A direction into the notes, or null to put back what was there.
  onUse: (direction: DesignDirectionOption | null) => void;
  onClose: () => void;
}) {
  const { data: rows, isLoading } = useDesignDirections(creativeId);
  const request = useRequestDesignDirection(creativeId);
  const choose = useChooseDesignDirection(creativeId);
  const { data: agency } = useMyAgency();
  const { data: client } = useClientDetail(clientId ?? "");
  const { data: prefs } = useClientPreferences(clientId);
  const theirs = client?.name ? `${client.name}’s` : "the client’s";
  const [openId, setOpenId] = useState<string | null>(null);
  const [skipped, setSkipped] = useState<string[]>([]);
  const row: DesignDirectionRow | undefined = rows?.find((r) => r.id === openId) ?? rows?.[0];
  const canAsk = !!concept.trim() || referenceUrls.length > 0;

  function ask() {
    request.mutate(
      { concept, referenceUrls, slideCount },
      {
        onSuccess: (r) => {
          setOpenId(r.id);
          setSkipped(r.skippedFiles);
        },
      },
    );
  }

  function use(i: number) {
    if (!row) return;
    const added = row.chosen === i;
    choose.mutate({ id: row.id, chosen: added ? null : i });
    onUse(added ? null : row.body.directions[i]);
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
            Each direction uses one of {agency?.name ? `${agency.name}’s` : "the workspace’s"} monthly AI requests.
          </span>
          <button type="button" className="btn" onClick={onClose}>
            Close
          </button>
        </>
      }
    >
      <div className="cchat">
        <div className="cchat-side">
          <button
            type="button"
            className="btn primary sm"
            disabled={request.isPending || !canAsk}
            title={canAsk ? undefined : "Write a concept or add a reference first"}
            onClick={ask}
          >
            {rows?.length ? "Write a New Direction" : "Write a Direction"}
          </button>
          <div className="cchat-head">Frank reads</div>
          <div className="cchat-note">
            <ul className="cchat-reads">
              <li>This post&rsquo;s Concept, format, WIIFM and Text on Image, as they are in the window.</li>
              <li>
                Each reference link&rsquo;s page and preview image, up to 8. A public Instagram post&rsquo;s likes and comments
                show which did best.
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
          {rows && rows.length > 1 && (
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
                    <b>{r.body.directions.map((d) => d.title).join(", ")}</b>
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
          {request.isPending ? (
            <div className="cchat-msg assistant pending" role="status">
              <div className="cchat-who">Frank</div>
              <div className="cchat-thinking">
                Frank is reading the references
                <span className="cchat-dots" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
              </div>
            </div>
          ) : !row ? (
            <div className="cchat-empty">
              {isLoading
                ? "Loading…"
                : "Frank reads the concept and the references, and suggests how to design this post: what the references do well, two or three directions, and what to avoid."}
            </div>
          ) : (
            <>
              {row.body.summary && <p className="ddir-summary">{row.body.summary}</p>}

              {row.refs.length > 0 && (
                <section>
                  <div className="cchat-head">What the references teach</div>
                  <div className="ddir-refs">
                    {row.refs.map((ref) => {
                      const lessons = row.body.references.find((r) => r.n === ref.n)?.lessons ?? [];
                      return (
                        <div className="ddir-ref" key={ref.n}>
                          <a href={ref.url} target="_blank" rel="noreferrer" aria-label={`Open reference ${ref.n}`}>
                            <RefThumb src={ref.image} />
                          </a>
                          <div className="ddir-ref-b">
                            <div className="ddir-ref-h">
                              <b>Reference {ref.n}</b>
                              {ref.title && <span>{ref.title}</span>}
                            </div>
                            {lessons.length ? (
                              <List items={lessons} />
                            ) : (
                              <p className="cchat-note">
                                {ref.read ? "Nothing particular to take from this one." : "Couldn’t be read: the page needs a sign-in or refused."}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {row.body.worked.length > 0 && (
                <section>
                  <div className="cchat-head">What has worked</div>
                  <List items={row.body.worked} />
                </section>
              )}

              <section>
                <div className="cchat-head">Directions</div>
                {notesHome && <p className="cchat-note">Use This puts a direction into {notesHome}.</p>}
                {row.body.directions.map((d, i) => {
                  const added = row.chosen === i;
                  return (
                    <div className="cchat-draft ddir-dir" key={i}>
                      <div className="cchat-draft-h">
                        <b>{d.title}</b>
                        <button
                          type="button"
                          className={`btn sm${added ? " added" : ""}`}
                          aria-pressed={added}
                          aria-label={added ? `Added: ${d.title}` : `Use This: ${d.title}`}
                          disabled={choose.isPending}
                          onClick={() => use(i)}
                        >
                          {added ? "Added" : "Use This"}
                        </button>
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

              {(row.body.guardrails.format.length > 0 ||
                row.body.guardrails.client.length > 0 ||
                row.body.guardrails.avoid.length > 0) && (
                <section>
                  <div className="cchat-head">Guardrails</div>
                  <div className="ddir-guard">
                    {row.body.guardrails.format.length > 0 && (
                      <div>
                        <b>The format</b>
                        <List items={row.body.guardrails.format} />
                      </div>
                    )}
                    {row.body.guardrails.client.length > 0 && (
                      <div>
                        <b>{client?.name ? `${client.name}’s brand` : "The brand"}</b>
                        <List items={row.body.guardrails.client} />
                      </div>
                    )}
                    {row.body.guardrails.avoid.length > 0 && (
                      <div>
                        <b>Avoid</b>
                        <List items={row.body.guardrails.avoid} />
                      </div>
                    )}
                  </div>
                </section>
              )}
              <p className="cchat-note">
                {row.author ?? "Someone"} asked Frank · {when(row.created_at)}
              </p>
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
