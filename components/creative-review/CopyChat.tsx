"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Modal } from "@/components/ui/Modal";
import { useCopyChats, useSendCopyChat, type CopyChat as Chat } from "@/hooks/use-copy-chats";
import { cleanReplyBody, isSlideField, type CopyChatField, type CopyChatMode } from "@/lib/ai/copy-chat";
import { errorMessage } from "@/lib/errors";
import { useLiveUpdates } from "@/hooks/use-live-updates";
import { useClientPreferences } from "@/hooks/use-client-preferences";
import { useClientDetail } from "@/hooks/use-client";
import { useMyAgency } from "@/hooks/use-my-agency";
import { feedbackReach, postsReach } from "@/lib/ai/copy-chat-context";

// A draft's fields, each with its own Use This (direct instruction):
// every copy field on its own (Caption, Alt Text…), and Text on Image as
// one, all its slides together.
function draftGroups(fields: CopyChatField[], draft: Record<string, string>) {
  const shown = fields.filter((f) => draft[f.key]);
  const slides = shown.filter((f) => isSlideField(f.key));
  return [
    ...shown.filter((f) => !isSlideField(f.key)).map((f) => ({ id: f.key, label: f.label, fields: [f] })),
    ...(slides.length ? [{ id: "slides", label: "Text on Image", fields: slides }] : []),
  ];
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const pick = (from: Record<string, string>, fields: CopyChatField[]) =>
  Object.fromEntries(fields.map((f) => [f.key, from[f.key] ?? ""]));

// A suggestion is "Added" while the editor holds exactly its words for
// that field (direct instruction): still so when the window is opened
// again, and not once the person changes any of it.
const holds = (editor: Record<string, string>, draft: Record<string, string>, fields: CopyChatField[]) =>
  fields.length > 0 && fields.every((f) => (editor[f.key] ?? "").trim() === (draft[f.key] ?? "").trim());

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

// "Write with Claude" (phase52): a conversation about this post's copy.
// Start by asking Claude to draft from the concept, or to review the draft
// in the editor; then talk it through. A draft Claude offers fills the
// editor field by field with "Use This"; nothing is saved as a copy version until the
// person saves one. Conversations stay with the post, for the team.
// Portalled to the page: it opens over the post window.
export function CopyChat({
  creativeId,
  postName,
  clientId,
  fields,
  currentFields,
  designerNotes,
  onUse,
  before,
  onBeforeChange,
  onClose,
}: {
  creativeId: string;
  // In the header, under "Draft with Frank" (direct instruction).
  postName: string;
  // The post's client, for what its Preferences let Frank read.
  clientId: string | null;
  fields: CopyChatField[];
  currentFields: Record<string, string>;
  // The post's Notes for Designer as they are in its window, for the
  // visual plan the copy goes with (direct instruction).
  designerNotes: { overall: string; slides: string[] };
  onUse: (fields: Record<string, string>) => void;
  // What the editor had in each field before Frank's went in, so Added
  // pressed again puts it back. Kept by the post's window, so it lasts
  // when this one is closed and opened again.
  before: Record<string, Record<string, string>>;
  onBeforeChange: (next: Record<string, Record<string, string>>) => void;
  onClose: () => void;
}) {
  const { data: chats, isLoading } = useCopyChats(creativeId);
  // A conversation going on in another window or device updates here too
  // (direct instruction): a new conversation for this post, or a new
  // message in one of its conversations.
  const chatIds = (chats ?? []).map((c) => c.id).sort().join(",");
  useLiveUpdates(
    `copy-chats:${creativeId}`,
    [
      { table: "copy_chats", filter: `creative_id=eq.${creativeId}` },
      ...(chatIds ? [{ table: "copy_chat_messages", filter: `chat_id=in.(${chatIds})` }] : []),
    ],
    [["copy-chats", creativeId]],
  );
  const send = useSendCopyChat(creativeId);
  const { data: prefs } = useClientPreferences(clientId);
  // Named, not "your workspace" or "the client" (direct instruction):
  // "No Fluff's", "Casa Carigar's", until the names load.
  const { data: agency } = useMyAgency();
  const { data: client } = useClientDetail(clientId ?? "");
  const ours = agency?.name ? `${agency.name}\u2019s` : "Your workspace\u2019s";
  const theirs = client?.name ? `${client.name}\u2019s` : "the client\u2019s";
  const [chatId, setChatId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [skipped, setSkipped] = useState<string[]>([]);
  const endRef = useRef<HTMLDivElement>(null);
  const chat: Chat | undefined = chats?.find((c) => c.id === chatId);
  const hasCopy = fields.some((f) => currentFields[f.key]?.trim());

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [chat?.messages.length, send.isPending]);

  function start(mode: CopyChatMode) {
    send.mutate(
      { mode, currentFields, designerNotes },
      {
        onSuccess: (r) => {
          setChatId(r.chatId);
          setSkipped(r.skippedFiles);
        },
      },
    );
  }

  function reply() {
    const message = draft.trim();
    if (!message || !chatId) return;
    // Out of the box and into the conversation at once; back in the box if
    // Frank doesn't answer.
    setDraft("");
    send.mutate(
      { chatId, message, currentFields, designerNotes },
      {
        onSuccess: (r) => setSkipped(r.skippedFiles),
        onError: () => setDraft(message),
      },
    );
  }

  const body = (
    <Modal
      title={
        <>
          <div className="modal-title-project">Draft with Frank</div>
          <div className="modal-title-post">{postName}</div>
        </>
      }
      ariaLabel="Draft with Frank"
      size="lg"
      onClose={onClose}
      footer={
        chat ? (
          <>
            <textarea
              className="cchat-input"
              rows={2}
              value={draft}
              placeholder="Ask for changes: shorter, warmer, a different hook…"
              aria-label="Message to Frank"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  reply();
                }
              }}
            />
            <button type="button" className="btn primary" disabled={!draft.trim() || send.isPending} onClick={reply}>
              Send
            </button>
          </>
        ) : (
          <>
            <span className="grow">Each message uses one of {agency?.name ? `${agency.name}\u2019s` : "the workspace\u2019s"} monthly AI requests.</span>
            <button type="button" className="btn" onClick={onClose}>
              Close
            </button>
          </>
        )
      }
    >
      <div className="cchat">
        <div className="cchat-side">
          <button type="button" className="btn primary sm" disabled={send.isPending} onClick={() => start("draft")}>
            Draft from the Concept
          </button>
          <button
            type="button"
            className="btn sm"
            disabled={send.isPending || !hasCopy}
            title={hasCopy ? undefined : "Write some copy first"}
            onClick={() => start("review")}
          >
            Review My Draft
          </button>
          {/* What Frank reads, in a little detail (direct instruction), the
              client's own choices included. */}
          {/* Headed like Earlier Conversations (direct instruction). */}
          <div className="cchat-head">Frank reads</div>
          <div className="cchat-note">
            <ul className="cchat-reads">
              <li>This post&rsquo;s brief: its name, format, Concept and WIIFM.</li>
              <li>Its Notes for Designer, as they are in the window, so the copy fits the visual.</li>
              <li>Each format&rsquo;s direction, from Knowledge.</li>
              <li>{capital(theirs)} strategy for the month the post goes live.</li>
              <li>
                {ours} and {theirs} Knowledge: notes in full, and up to 10 PDFs or images.
              </li>
              <li>
                {!prefs || prefs.frank_posts === "off"
                  ? `Not ${theirs} Approved posts: off in ${theirs} Preferences.`
                  : `Up to 8 of ${theirs} Approved posts ${postsReach(prefs.frank_posts)}, for their voice: copy, VO and Text on Image.`}
              </li>
              <li>
                {!prefs || prefs.frank_feedback === "off"
                  ? `Not ${theirs} comments: off in ${theirs} Preferences.`
                  : `Up to 20 of ${theirs} own comments ${feedbackReach(prefs.frank_feedback)}, as standing direction, not praise or approvals.`}
              </li>
              <li>The copy in the editor, and this conversation.</li>
            </ul>
          </div>
          {!!chats?.length && (
            <>
              <div className="cchat-head">Earlier conversations</div>
              {/* Scrolls on its own once there are more than fit (direct
                  instruction). */}
              <div className="cchat-pastlist">
                {chats.map((c) => (
                  <button
                    type="button"
                    key={c.id}
                    className="cchat-past"
                    aria-pressed={c.id === chatId}
                    onClick={() => setChatId(c.id)}
                  >
                    <b>{c.mode === "draft" ? "Drafted from the concept" : "Reviewed a draft"}</b>
                    <span>
                      {c.author ?? "Someone"} · {when(c.updated_at)}
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="cchat-main" aria-live="polite">
          {!chat && !send.isPending && (
            <div className="cchat-empty">
              {isLoading ? "Frank is working…" : "Start by drafting from the concept, or ask for a review of the copy you've written."}
            </div>
          )}
          {chat?.messages.map((m) => (
            <div key={m.id} className={`cchat-msg ${m.role}`}>
              <div className="cchat-who">{m.role === "user" ? "You" : "Frank"}</div>
              {/* Cleaned on show too: a reply saved before the parser kept
                  cut-off drafts can still hold the raw JSON. */}
              <div className="cchat-body">{m.role === "assistant" ? cleanReplyBody(m.body) : m.body}</div>
              {m.drafts.map((d, i) => (
                <div className="cchat-draft" key={i}>
                  <div className="cchat-draft-h">
                    <b>{d.label}</b>
                  </div>
                  {draftGroups(fields, d.fields).map((g) => {
                    const isAdded = holds(currentFields, d.fields, g.fields);
                    return (
                      <div key={g.id} className="cchat-group">
                        <div className="cchat-fields">
                          {g.fields.map((f) => (
                            <div key={f.key} className="cchat-field">
                              <span>{f.label}</span>
                              <p>{d.fields[f.key]}</p>
                            </div>
                          ))}
                        </div>
                        <button
                          type="button"
                          className={`btn sm${isAdded ? " added" : ""}`}
                          aria-pressed={isAdded}
                          aria-label={isAdded ? `Added: ${g.label}` : `Use This for ${g.label}`}
                          onClick={() => {
                            if (isAdded) {
                              // Pressed again: the editor goes back to what it had
                              // (empty when that's not known).
                              onUse(before[g.id] ?? pick({}, g.fields));
                              const next = { ...before };
                              delete next[g.id];
                              onBeforeChange(next);
                            } else {
                              // In. Replacing another suggestion of Frank's, what to
                              // go back to stays the editor's own; otherwise it's
                              // what's there now, the person's edits included.
                              const frankIn = chat?.messages.some((msg) =>
                                msg.drafts.some((other) =>
                                  holds(currentFields, other.fields, draftGroups(fields, other.fields).find((x) => x.id === g.id)?.fields ?? []),
                                ),
                              );
                              onBeforeChange({
                                ...before,
                                [g.id]: frankIn && before[g.id] ? before[g.id] : pick(currentFields, g.fields),
                              });
                              onUse(pick(d.fields, g.fields));
                            }
                          }}
                        >
                          {isAdded ? "Added" : "Use This"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          ))}
          {/* While Claude answers (direct instruction: it takes a while, so
              say so): what you sent shows at once, then Frank thinking. */}
          {send.isPending && send.variables?.message && (
            <div className="cchat-msg user">
              <div className="cchat-who">You</div>
              <div className="cchat-body">{send.variables.message}</div>
            </div>
          )}
          {send.isPending && (
            <div className="cchat-msg assistant pending" role="status">
              <div className="cchat-who">Frank</div>
              <div className="cchat-thinking">
                Frank is thinking
                <span className="cchat-dots" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
              </div>
            </div>
          )}
          {send.error && <p className="autherr">{errorMessage(send.error, "Frank didn't answer")}</p>}
          {skipped.length > 0 && (
            <p className="cchat-note">Too large to include this time: {skipped.join(", ")}.</p>
          )}
          <div ref={endRef} />
        </div>
      </div>
    </Modal>
  );
  return createPortal(body, document.body);
}
