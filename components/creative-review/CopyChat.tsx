"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Modal } from "@/components/ui/Modal";
import { useCopyChats, useSendCopyChat, type CopyChat as Chat } from "@/hooks/use-copy-chats";
import { cleanReplyBody, isSlideField, type CopyChatField, type CopyChatMode } from "@/lib/ai/copy-chat";
import { errorMessage } from "@/lib/errors";
import { useLiveUpdates } from "@/hooks/use-live-updates";

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

const pick = (from: Record<string, string>, fields: CopyChatField[]) =>
  Object.fromEntries(fields.map((f) => [f.key, from[f.key] ?? ""]));

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
  fields,
  currentFields,
  onUse,
  onClose,
}: {
  creativeId: string;
  fields: CopyChatField[];
  currentFields: Record<string, string>;
  onUse: (fields: Record<string, string>) => void;
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
  const [chatId, setChatId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [skipped, setSkipped] = useState<string[]>([]);
  // Which suggestion is in the editor for each field, and what the editor
  // had before Frank's, so pressing Added again puts that back.
  const [added, setAdded] = useState<Record<string, { source: string; before: Record<string, string> }>>({});
  const endRef = useRef<HTMLDivElement>(null);
  const chat: Chat | undefined = chats?.find((c) => c.id === chatId);
  const hasCopy = fields.some((f) => currentFields[f.key]?.trim());

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [chat?.messages.length, send.isPending]);

  function start(mode: CopyChatMode) {
    send.mutate(
      { mode, currentFields },
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
      { chatId, message, currentFields },
      {
        onSuccess: (r) => setSkipped(r.skippedFiles),
        onError: () => setDraft(message),
      },
    );
  }

  const body = (
    <Modal
      title="Draft with Frank"
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
            <span className="grow">Each message uses one of the workspace&rsquo;s monthly AI requests.</span>
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
          <p className="cchat-note">
            Frank reads the brief, the WIIFM, each format&rsquo;s direction, your workspace&rsquo;s and this
            client&rsquo;s knowledge, the client&rsquo;s other posts for their voice, and what the client has asked
            for in the last 90 days.
          </p>
          {!!chats?.length && (
            <>
              <div className="cchat-head">Earlier conversations</div>
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
                    const source = `${m.id}-${i}`;
                    const isAdded = added[g.id]?.source === source;
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
                              // Pressed again: the editor goes back to what it had.
                              onUse(added[g.id].before);
                              setAdded((prev) => {
                                const next = { ...prev };
                                delete next[g.id];
                                return next;
                              });
                            } else {
                              // In, replacing another suggestion's if there was one;
                              // what to go back to is still the editor's own.
                              const before = added[g.id]?.before ?? pick(currentFields, g.fields);
                              onUse(pick(d.fields, g.fields));
                              setAdded((prev) => ({ ...prev, [g.id]: { source, before } }));
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
