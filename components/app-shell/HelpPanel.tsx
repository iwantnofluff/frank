"use client";

import { useEffect, useRef, useState } from "react";
import { usePresence } from "@/hooks/use-presence";
import {
  HELP_ARTICLES,
  HELP_CATEGORIES,
  HELP_TOPICS,
  helpArticle,
  searchHelp,
  type HelpArticle,
  type HelpBlock,
} from "@/lib/help-content";

type View = { kind: "home" } | { kind: "category"; id: string } | { kind: "article"; id: string };

function Chevron({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

function Blocks({ blocks }: { blocks: HelpBlock[] }) {
  return (
    <>
      {blocks.map((b, i) => {
        switch (b.kind) {
          case "h":
            return <h3 key={i}>{b.text}</h3>;
          case "p":
            return <p key={i}>{b.text}</p>;
          case "list":
            return (
              <ul key={i}>
                {b.items.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            );
          case "steps":
            return (
              <ol key={i}>
                {b.items.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ol>
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
export function HelpPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pop = usePresence(open);
  const [history, setHistory] = useState<View[]>([{ kind: "home" }]);
  const [query, setQuery] = useState("");
  const body = useRef<HTMLDivElement>(null);
  const view = history[history.length - 1];

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !document.querySelector(".scrim:not(.closing)")) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Each new view starts at its top.
  useEffect(() => {
    body.current?.scrollTo({ top: 0 });
  }, [history.length]);

  if (!pop.shown) return null;

  const push = (v: View) => setHistory((h) => [...h, v]);
  const back = () => setHistory((h) => (h.length > 1 ? h.slice(0, -1) : h));
  const results = searchHelp(query);
  const article = view.kind === "article" ? helpArticle(view.id) : null;
  const category = view.kind === "category" ? HELP_CATEGORIES.find((c) => c.id === view.id) : null;

  return (
    <aside className={`helppanel${pop.isOpen ? " is-open" : ""}`} aria-label="Help">
      <div className="help-h">
        {view.kind !== "home" && (
          <button type="button" className="help-ib" aria-label="Back" onClick={back}>
            <Chevron d="M15 18l-6-6 6-6" />
          </button>
        )}
        {/* The windows' logomark, before the title (direct instruction). */}
        {/* eslint-disable-next-line @next/next/no-img-element -- a static SVG */}
        <img className="help-mark" src="/brand/frank-logomark.svg" alt="" aria-hidden="true" />
        <b>Help</b>
        <button type="button" className="help-ib" aria-label="Close help" onClick={onClose}>
          <Chevron d="M18 6L6 18M6 6l12 12" />
        </button>
      </div>

      <div className="help-b" ref={body}>
        {view.kind === "home" && (
          <>
            <p className="help-k">Find answers quickly</p>
            <label className="help-search">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <path d="M20 20l-4-4" />
              </svg>
              <input
                type="search"
                placeholder="How can we help?"
                aria-label="Search help"
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
                <p className="help-k">Explore help topics</p>
                <div className="help-topics">
                  {HELP_TOPICS.map((id) => {
                    const a = helpArticle(id);
                    return a ? (
                      <button type="button" className="help-topic" key={id} onClick={() => push({ kind: "article", id })}>
                        <span className="help-topic-ic" aria-hidden="true">
                          ?
                        </span>
                        <b>{a.title}</b>
                      </button>
                    ) : null;
                  })}
                </div>

                <p className="help-k">Help categories</p>
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
            <Blocks blocks={article.blocks} />
          </article>
        )}
      </div>
    </aside>
  );
}
