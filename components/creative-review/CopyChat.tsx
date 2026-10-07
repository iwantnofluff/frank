"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Modal } from "@/components/ui/Modal";
import { useCopyChats, useSendCopyChat, type CopyChat as Chat } from "@/hooks/use-copy-chats";
import { cleanReplyBody, type CopyChatField, type CopyChatMode } from "@/lib/ai/copy-chat";
import { errorMessage } from "@/lib/errors";
import { useLiveUpdates } from "@/hooks/use-live-updates";

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

// "Write with Claude" (phase52): a conversation about this post's copy.
// Start by asking Claude to draft from the concept, or to review the draft
// in the editor; then talk it through. A draft Claude offers fills the
// editor with "Use this"; nothing is saved as a copy version until the
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
  const [used, setUsed] = useState<string | null>(null);
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
    send.mutate(
      { chatId, message, currentFields },
      {
        onSuccess: (r) => {
          setDraft("");
          setSkipped(r.skippedFiles);
        },
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
            <span className="grow">Each message uses one of the agency&rsquo;s monthly AI requests.</span>
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
            Frank reads the brief, the WIIFM, each format&rsquo;s direction, and your agency&rsquo;s and this
            client&rsquo;s knowledge, files included.
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
                    <button
                      type="button"
                      className="btn sm"
                      onClick={() => {
                        onUse(d.fields);
                        setUsed(`${m.id}-${i}`);
                      }}
                    >
                      {used === `${m.id}-${i}` ? "In the editor" : "Use This"}
                    </button>
                  </div>
                  {fields
                    .filter((f) => d.fields[f.key])
                    .map((f) => (
                      <div key={f.key} className="cchat-field">
                        <span>{f.label}</span>
                        <p>{d.fields[f.key]}</p>
                      </div>
                    ))}
                </div>
              ))}
            </div>
          ))}
          {send.isPending && <div className="cchat-msg assistant pending">Frank is working…</div>}
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
