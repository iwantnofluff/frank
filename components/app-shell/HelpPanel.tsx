"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePresence } from "@/hooks/use-presence";
import { CalendarIcon, ClientsIcon } from "./icons";
import {
  HELP_ARTICLES,
  HELP_LINK,
  HELP_CATEGORIES,
  HELP_TOPICS,
  helpArticle,
  searchHelp,
  type HelpArticle,
  type HelpBlock,
} from "@/lib/help-content";
import { BRAND } from "@/lib/brand";
import { GUIDES, startTour } from "@/lib/tour";
import { useTouring } from "@/lib/use-touring";
import { usePathname, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useClients } from "@/hooks/use-clients";
import { useMyAgency } from "@/hooks/use-my-agency";
import { useIsStaff } from "@/hooks/use-is-staff";
import { usePhoneScreen } from "@/hooks/use-phone-screen";

type View = { kind: "home" } | { kind: "category"; id: string } | { kind: "article"; id: string } | { kind: "ask" };

function Chevron({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

// Each help topic's icon (direct instruction: in place of a "?"), taken from
// where that thing lives in Frank: the rail's Clients, the Content
// Planner's calendar, the post's Share, Frank's own mark for drafting.
// Instagram has no icon elsewhere in Frank; its camera outline is drawn in
// the same line style (docs/parity-gaps.md).
const TOPIC_ICONS: Record<string, ReactNode> = {
  "create-client": <ClientsIcon />,
  "plan-posts": <CalendarIcon />,
  "send-for-review": (
    <svg viewBox="0 0 24 24">
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" />
    </svg>
  ),
  // eslint-disable-next-line @next/next/no-img-element -- a static SVG, drawn as is
  "write-with-claude": <img src={BRAND.logomark} alt="" />,
  "connect-instagram": (
    <svg viewBox="0 0 24 24">
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <path d="M17.5 6.5h.01" />
    </svg>
  ),
};

// A list item in short paragraphs (direct instruction: no chunky blocks);
// a blank line in its text starts the next.
// Where a help link's client page is (phase147, direct instruction): the
// client you're in (its page, or one of its projects), else the sample
// client. None for a client's own people, who don't have those pages.
function useLinkClient(): string | null {
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const { data: clients } = useClients();
  const { isStaff } = useIsStaff();
  if (!isStaff) return null;
  const inClient = pathname.match(/^\/clients\/([^/]+)/)?.[1];
  if (inClient) return inClient;
  const inProject = pathname.match(/^\/projects\/([^/]+)/)?.[1];
  const project = inProject ? queryClient.getQueryData<{ client_id: string }>(["project", inProject]) : undefined;
  if (project?.client_id) return project.client_id;
  return clients?.find((c) => c.is_sample)?.id ?? null;
}

// Help text with its links: a link goes to that page, Help staying open
// where it is (direct instruction).
function Rich({ text, onHelp, onShow }: { text: string; onHelp?: (id: string) => void; onShow?: (id: string) => void }) {
  const router = useRouter();
  const client = useLinkClient();
  const out: ReactNode[] = [];
  let at = 0;
  for (const m of text.matchAll(HELP_LINK)) {
    out.push(text.slice(at, m.index));
    const [, words, target] = m;
    // A Help topic (help:<id>) opens in the panel; a Show Me (showme:<id>)
    // starts its walkthrough (Ask Frank's answers, phase147).
    if (target.startsWith("help:") || target.startsWith("showme:")) {
      const id = target.slice(target.indexOf(":") + 1);
      const act = target.startsWith("help:") ? (helpArticle(id) ? onHelp : undefined) : GUIDES[id] ? onShow : undefined;
      out.push(
        act ? (
          <button key={m.index} type="button" className={target.startsWith("showme:") ? "help-link help-showlink" : "help-link"} onClick={() => act(id)}>
            {words}
          </button>
        ) : (
          words
        ),
      );
      at = m.index + m[0].length;
      continue;
    }
    const href = target.startsWith("client:") ? (client ? `/clients/${client}${target.slice(7)}` : null) : target.startsWith("/") ? target : null;
    out.push(
      href ? (
        <a
          key={m.index}
          className="help-link"
          href={href}
          onClick={(e) => {
            e.preventDefault();
            router.push(href);
          }}
        >
          {words}
        </a>
      ) : (
        words
      ),
    );
    at = m.index + m[0].length;
  }
  out.push(text.slice(at));
  return <>{out}</>;
}

function Item({ text }: { text: string }) {
  const parts = text.split("\n\n");
  return (
    <>
      <Rich text={parts[0]} />
      {parts.slice(1).map((p) => (
        <span className="li-p" key={p}>
          <Rich text={p} />
        </span>
      ))}
    </>
  );
}

// Ask Frank's answer as written: paragraphs, numbered steps and bullets,
// with its links.
function Answer({ text, onHelp, onShow }: { text: string; onHelp: (id: string) => void; onShow?: (id: string) => void }) {
  const groups: { kind: "p" | "ol" | "ul"; lines: string[] }[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) {
      groups.push({ kind: "p", lines: [] });
      continue;
    }
    const kind = /^\d+[.)]\s/.test(line) ? "ol" : /^[-•*]\s/.test(line) ? "ul" : "p";
    const body = kind === "ol" ? line.replace(/^\d+[.)]\s/, "") : kind === "ul" ? line.replace(/^[-•*]\s/, "") : line;
    const last = groups[groups.length - 1];
    if (last && last.kind === kind && (kind !== "p" || last.lines.length)) last.lines.push(body);
    else groups.push({ kind, lines: [body] });
  }
  return (
    <>
      {groups
        .filter((g) => g.lines.length)
        .map((g, i) =>
          g.kind === "p" ? (
            <p key={i}>
              <Rich text={g.lines.join(" ")} onHelp={onHelp} onShow={onShow} />
            </p>
          ) : (
            (() => {
              const List = g.kind;
              return (
                <List key={i}>
                  {g.lines.map((l, j) => (
                    <li key={j}>
                      <Rich text={l} onHelp={onHelp} onShow={onShow} />
                    </li>
                  ))}
                </List>
              );
            })()
          ),
        )}
    </>
  );
}

interface AskTurn {
  role: "user" | "frank";
  text: string;
  error?: boolean;
}

function Blocks({ blocks, onHelp }: { blocks: HelpBlock[]; onHelp?: (id: string) => void }) {
  return (
    <>
      {blocks.map((b, i) => {
        switch (b.kind) {
          case "h":
            return <h3 key={i}>{b.text}</h3>;
          case "p":
            return (
              <p key={i}>
                <Rich text={b.text} onHelp={onHelp} />
              </p>
            );
          case "list":
            return (
              <ul key={i}>
                {b.items.map((t) => (
                  <li key={t}>
                    <Item text={t} />
                  </li>
                ))}
              </ul>
            );
          case "steps":
            return (
              <ol key={i}>
                {b.items.map((t) => (
                  <li key={t}>
                    <Item text={t} />
                  </li>
                ))}
              </ol>
            );
          case "mark":
            // The mark's own colours and proportions (frank-logomark.svg):
            // each line a little shorter than the one above.
            return (
              <div className="help-mark-story" key={i} aria-label="The Frank mark">
                {b.items.map((t, n) => (
                  <div className="hms-row" key={t}>
                    <span className={`hms-bar hms-${n}`} aria-hidden="true" />
                    <span className="hms-t">{t}</span>
                  </div>
                ))}
              </div>
            );
          case "note":
            return (
              <div className="help-note" key={i}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 3l9.5 17h-19z" />
                  <path d="M12 10v4M12 17.2v.01" />
                </svg>
                <p>
                  <b>Note:</b> {b.text}
                </p>
              </div>
            );
        }
      })}
    </>
  );
}

function ArticleRow({ a, onOpen }: { a: HelpArticle; onOpen: () => void }) {
  return (
    <button type="button" className="help-row" onClick={onOpen}>
      <b>{a.title}</b>
      <span>{a.summary}</span>
    </button>
  );
}

// Help (direct instruction, after Slack's): a panel from the right, opened
// from the "?" in the header. Its home has a search, the topics most people
// need, and the categories at its foot; a category lists its articles, an
// article reads like Slack's, with Back to where you came from. It slides
// in and out with the menus' motion (hooks/use-presence.ts).
// Opens Help at one article from anywhere (a tip's Read More): the header
// listens for it.
export const HELP_OPEN_EVENT = "frank:open-help";
export function openHelpArticle(id: string) {
  window.dispatchEvent(new CustomEvent(HELP_OPEN_EVENT, { detail: { id } }));
}

export function HelpPanel({
  open,
  onClose,
  startAt,
}: {
  open: boolean;
  onClose: () => void;
  // An article to open at, asked for from elsewhere; `at` makes asking for
  // the same one again count.
  startAt?: { id: string; at: number } | null;
}) {
  const pop = usePresence(open);
  const [history, setHistory] = useState<View[]>([{ kind: "home" }]);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  if (startAt && startAt.at !== startedAt && helpArticle(startAt.id)) {
    setStartedAt(startAt.at);
    setHistory([{ kind: "home" }, { kind: "article", id: startAt.id }]);
  }
  const [query, setQuery] = useState("");
  const body = useRef<HTMLDivElement>(null);
  const view = history[history.length - 1];

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      // Not while a walkthrough runs, whose Escape ends it (or closes what
      // it opened), Help staying where it is.
      if (!e.isTrusted || document.querySelector(".tour")) return;
      if (e.key === "Escape" && !document.querySelector(".scrim:not(.closing)")) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Each new view starts at its top.
  useEffect(() => {
    body.current?.scrollTo({ top: 0 });
  }, [history.length]);

  // Show Me (phase147): the team's, on a computer, where there's something
  // to show.
  const { isStaff, isPending: staffPending } = useIsStaff();
  const phone = usePhoneScreen();
  const canShow = isStaff && !staffPending && !phone;
  const touring = useTouring();

  // Ask Frank (phase147, direct instruction): a conversation for this visit
  // only, answered as it's written.
  const { data: agency } = useMyAgency();
  const pathname = usePathname();
  const [turns, setTurns] = useState<AskTurn[]>([]);
  const [draft, setDraft] = useState("");
  const [asking, setAsking] = useState(false);
  useEffect(() => {
    if (view.kind === "ask") body.current?.scrollTo({ top: body.current.scrollHeight });
  }, [turns, view.kind]);
  async function ask() {
    const question = draft.trim();
    if (!question || asking || !agency?.agencyId) return;
    const before = turns.filter((t) => !t.error && t.text);
    setTurns((t) => [...t, { role: "user", text: question }, { role: "frank", text: "" }]);
    setDraft("");
    setAsking(true);
    if (view.kind !== "ask") setHistory((h) => [...h, { kind: "ask" }]);
    const answer = (text: string, error = false) =>
      setTurns((t) => [...t.slice(0, -1), { role: "frank", text, error }]);
    try {
      const res = await fetch("/api/ai/ask-frank", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agencyId: agency.agencyId, question, history: before, path: pathname }),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        answer(data.error ?? "Frank couldn't answer just now. Try again in a moment.", true);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let text = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as { type: string; text?: string; error?: string };
          if (event.type === "text") {
            text += event.text ?? "";
            answer(text);
          } else if (event.type === "done") answer(event.text ?? text);
          else if (event.type === "error") answer(event.error ?? "Frank couldn't answer just now.", true);
        }
      }
    } catch {
      answer("Frank couldn't answer just now. Try again in a moment.", true);
    } finally {
      setAsking(false);
    }
  }

  if (!pop.shown) return null;

  const push = (v: View) => setHistory((h) => [...h, v]);
  const back = () => setHistory((h) => (h.length > 1 ? h.slice(0, -1) : h));
  const results = searchHelp(query);
  const article = view.kind === "article" ? helpArticle(view.id) : null;
  const category = view.kind === "category" ? HELP_CATEGORIES.find((c) => c.id === view.id) : null;

  return (
    <aside
      // Out of sight while Frank Tour or a Show Me runs, not closed: it comes
      // back on the same topic, scrolled where it was (direct instruction).
      className={`helppanel${pop.isOpen ? " is-open" : ""}${touring ? " stepaside" : ""}`}
      aria-label="Ask Frank"
      aria-hidden={touring || undefined}
    >
      <div className="help-h">
        {view.kind !== "home" && (
          <button type="button" className="help-ib" aria-label="Back" onClick={back}>
            <Chevron d="M15 18l-6-6 6-6" />
          </button>
        )}
        {/* The windows' logomark, before the title (direct instruction). */}
        {/* eslint-disable-next-line @next/next/no-img-element -- a static SVG */}
        <img className="help-mark" src={BRAND.logomark} alt="" aria-hidden="true" />
        <b>Ask Frank</b>
        <button type="button" className="help-ib" aria-label="Close Ask Frank" onClick={onClose}>
          <Chevron d="M18 6L6 18M6 6l12 12" />
        </button>
      </div>

      <div className="help-b" ref={body}>
        {view.kind === "home" && (
          <>
            {turns.length > 0 && (
              <button type="button" className="help-row ask-back" onClick={() => push({ kind: "ask" })}>
                <b>Your conversation with Frank</b>
                <span>{turns.filter((t) => t.role === "user").length} question{turns.filter((t) => t.role === "user").length === 1 ? "" : "s"} so far</span>
              </button>
            )}
            <p className="help-k">Find Answers Quickly</p>
            <label className="help-search">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <path d="M20 20l-4-4" />
              </svg>
              <input
                type="search"
                placeholder="Search topics"
                aria-label="Search topics"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>

            {query.trim() ? (
              <div className="help-list">
                {results.length === 0 ? (
                  <p className="help-none">Nothing matches that yet. Try fewer words.</p>
                ) : (
                  results.map((a) => <ArticleRow key={a.id} a={a} onOpen={() => push({ kind: "article", id: a.id })} />)
                )}
              </div>
            ) : (
              <>
                <p className="help-k">Explore Topics</p>
                <div className="help-topics">
                  {HELP_TOPICS.map((id) => {
                    const a = helpArticle(id);
                    return a ? (
                      <button type="button" className="help-topic" key={id} onClick={() => push({ kind: "article", id })}>
                        <span className="help-topic-ic" aria-hidden="true">
                          {TOPIC_ICONS[id] ?? "?"}
                        </span>
                        <b>{a.title}</b>
                      </button>
                    ) : null;
                  })}
                </div>

                <p className="help-k">Categories</p>
                <div className="help-cats">
                  {HELP_CATEGORIES.map((c) => (
                    <button type="button" className="help-cat" key={c.id} onClick={() => push({ kind: "category", id: c.id })}>
                      {c.label}
                      <Chevron d="M5 12h14M13 6l6 6-6 6" />
                    </button>
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {category && (
          <>
            <h2 className="help-title">{category.label}</h2>
            {canShow && HELP_ARTICLES.some((a) => a.category === category.id && GUIDES[a.id]) && (
              <ShowMe label={`Show me ${category.label}`} onClick={() => startTour({ category: category.id })} />
            )}
            <div className="help-list">
              {HELP_ARTICLES.filter((a) => a.category === category.id).map((a) => (
                <ArticleRow key={a.id} a={a} onOpen={() => push({ kind: "article", id: a.id })} />
              ))}
            </div>
          </>
        )}

        {article && (
          <article className="help-article">
            <h2 className="help-title">{article.title}</h2>
            <Blocks blocks={article.blocks} onHelp={(id) => push({ kind: "article", id })} />
            {/* Under the topic's text (direct instruction). */}
            {canShow && GUIDES[article.id] && (
              <ShowMe label={`Show me ${article.title}`} onClick={() => startTour({ guide: article.id })} />
            )}
          </article>
        )}

        {view.kind === "ask" && (
          <div className="ask-convo" aria-live="polite">
            <h2 className="help-title">Ask Frank</h2>
            <p className="ask-note">Frank answers from these Help topics. It can get things wrong, so check anything important.</p>
            {turns.map((t, i) =>
              t.role === "user" ? (
                <p className="ask-q" key={i}>
                  {t.text}
                </p>
              ) : (
                <div className={`ask-a${t.error ? " err" : ""}`} key={i}>
                  {t.text ? (
                    t.error ? (
                      <p>{t.text}</p>
                    ) : (
                      <Answer
                        text={t.text}
                        onHelp={(id) => push({ kind: "article", id })}
                        onShow={canShow ? (id) => startTour({ guide: id }) : undefined}
                      />
                    )
                  ) : (
                    <p className="ask-wait">Frank is thinking…</p>
                  )}
                </div>
              ),
            )}
          </div>
        )}
      </div>

      {/* Ask Frank anything (direct instruction), under everything else. */}
      <form
        className="ask-f"
        onSubmit={(e) => {
          e.preventDefault();
          void ask();
        }}
      >
        <textarea
          rows={1}
          placeholder="Ask Frank anything"
          aria-label="Ask Frank anything"
          value={draft}
          maxLength={1000}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void ask();
            }
          }}
        />
        <button type="submit" className="btn sm primary" disabled={!draft.trim() || asking || !agency}>
          {asking ? "…" : "Ask"}
        </button>
      </form>
    </aside>
  );
}

// Help's Show Me (phase147, direct instruction): the topic's or category's
// walkthrough, in Frank Tour's look, on the sample client.
function ShowMe({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <div className="help-showme">
      <button type="button" className="btn sm primary" aria-label={label} onClick={onClick}>
        Show Me
      </button>
      <span>A short walkthrough, on your sample client.</span>
    </div>
  );
}
