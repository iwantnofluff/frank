"use client";

import { useLayoutEffect, useRef, useState } from "react";
import type { TeamMember } from "@/hooks/use-project-discussion";

// Typing @ in a box offers the project's team; picking one puts @Name in
// and remembers who, kept only while @Name stays in the words. Shared by a
// project's Discussion (phase84) and a post's comments (phase138).
export function useMentions(team: TeamMember[], initialText = "", initialPicked: string[] = []) {
  const [text, setText] = useState(initialText);
  const [picked, setPicked] = useState<string[]>(initialPicked);
  const [query, setQuery] = useState<string | null>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  // Where the caret goes once a picked name is in: straight after it, the
  // moment the new words are on screen, before anything else is typed.
  const caretAt = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (caretAt.current === null) return;
    box.current?.focus();
    box.current?.setSelectionRange(caretAt.current, caretAt.current);
    caretAt.current = null;
  }, [text]);

  const matches = query === null ? [] : team.filter((t) => t.name.toLowerCase().includes(query.toLowerCase())).slice(0, 6);

  function onChange(value: string, caret: number) {
    setText(value);
    // An @ word being typed, right before the caret.
    const m = value.slice(0, caret).match(/(?:^|\s)@([^\s@]{0,30})$/);
    setQuery(m ? m[1] : null);
  }

  function pick(member: TeamMember) {
    const caret = box.current?.selectionStart ?? text.length;
    const start = text.slice(0, caret).lastIndexOf("@");
    const next = `${text.slice(0, start)}@${member.name} ${text.slice(caret)}`;
    setText(next);
    setPicked((p) => (p.includes(member.user_id) ? p : [...p, member.user_id]));
    setQuery(null);
    caretAt.current = start + member.name.length + 2;
  }

  // Who these words still mention.
  function mentionsIn(body: string) {
    return picked.filter((id) => {
      const name = team.find((t) => t.user_id === id)?.name;
      return name && body.includes(`@${name}`);
    });
  }

  function reset() {
    setText("");
    setPicked([]);
    setQuery(null);
  }

  return { text, box, matches, onChange, pick, mentionsIn, reset, closePicker: () => setQuery(null) };
}

// The list under (or, for a box at the foot of a panel, over) the box.
export function MentionPicker({ matches, onPick }: { matches: TeamMember[]; onPick: (m: TeamMember) => void }) {
  if (!matches.length) return null;
  return (
    <div className="pj-pick" role="listbox" aria-label="Mention someone">
      {matches.map((m) => (
        <button
          type="button"
          role="option"
          aria-selected="false"
          key={m.user_id}
          onMouseDown={(e) => {
            e.preventDefault();
            onPick(m);
          }}
        >
          @{m.name}
        </button>
      ))}
    </div>
  );
}

// The words, with each @Name that's a mention marked.
export function MentionText({ text, mentions, team }: { text: string; mentions: string[]; team: TeamMember[] }) {
  const names = team.filter((t) => mentions.includes(t.user_id)).map((t) => `@${t.name}`);
  if (!names.length) return <>{text}</>;
  const pattern = new RegExp(`(${names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "g");
  return (
    <>
      {text.split(pattern).map((part, i) =>
        names.includes(part) ? (
          <span className="pj-mention" key={i}>
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </>
  );
}
