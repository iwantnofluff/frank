"use client";

import { useState } from "react";
import {
  useAddProofreadRule,
  useDeleteProofreadRule,
  useProofreadRules,
  useSetBuiltinRule,
  useUpdateProofreadRule,
} from "@/hooks/use-proofread-rules";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { errorMessage } from "@/lib/errors";
import {
  BUILTIN_GROUPS,
  BUILTIN_RULES,
  DEFAULT_AI_PHRASES,
  resolveRules,
  type ProofreadRuleRow,
  type SpellingConvention,
} from "@/lib/proofread-rules";

// An on/off switch; saves as it's flipped.
function Switch({ on, label, disabled, onChange }: { on: boolean; label: string; disabled?: boolean; onChange: (on: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      className="pr-switch"
      disabled={disabled}
      onClick={() => onChange(!on)}
    >
      <span />
    </button>
  );
}

// Settings → Knowledge → Proofreading (phase122, direct instruction): the
// rules Frank proofreads by, each switched on or off for the workspace,
// and the workspace's own: instructions for the AI, and preferred words
// checked exactly. Owners and Admins change them; a User reads them.
export function ProofreadRulesSettings({ agencyId, canEdit }: { agencyId: string; canEdit: boolean }) {
  const { data: rows, isLoading, isError } = useProofreadRules(agencyId);
  const setBuiltin = useSetBuiltinRule(agencyId);
  const addRule = useAddProofreadRule(agencyId);
  const updateRule = useUpdateProofreadRule(agencyId);
  const deleteRule = useDeleteProofreadRule(agencyId);

  const [adding, setAdding] = useState<"instruction" | "word" | null>(null);
  const [draft, setDraft] = useState("");
  const [fromWord, setFromWord] = useState("");
  const [toWord, setToWord] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [phrasesOpen, setPhrasesOpen] = useState(false);
  const [phrasesText, setPhrasesText] = useState("");
  const [removing, setRemoving] = useState<ProofreadRuleRow | null>(null);
  // Reset to Frank's List, while its warning is open, and its Copy.
  const [resetting, setResetting] = useState(false);
  const [copied, setCopied] = useState<"yes" | "failed" | null>(null);

  if (isError)
    return (
      <div className="empty">
        <b>Couldn&rsquo;t load the proofreading rules</b>
      </div>
    );
  if (isLoading || !rows) return null;

  const rules = resolveRules(rows);
  const builtinRow = (key: string) => rows.find((r) => r.kind === "builtin" && r.rule_key === key);
  // While a switch saves, it shows where it's going.
  const shownOn = (key: string) =>
    setBuiltin.isPending && setBuiltin.variables?.key === key ? setBuiltin.variables.enabled : rules.on(key);
  const flip = (key: string, enabled: boolean, options?: Record<string, unknown>) =>
    setBuiltin.mutate({ key, enabled, options: options ?? builtinRow(key)?.options ?? {} });
  const onCount = BUILTIN_RULES.filter((r) => rules.on(r.key)).length;

  const instructions = rows.filter((r) => r.kind === "instruction");
  const words = rows.filter((r) => r.kind === "word");
  const ownOn = (r: ProofreadRuleRow) =>
    updateRule.isPending && updateRule.variables?.id === r.id && updateRule.variables.enabled !== undefined
      ? updateRule.variables.enabled
      : r.enabled;

  const closeAdd = () => {
    setAdding(null);
    setDraft("");
    setFromWord("");
    setToWord("");
    addRule.reset();
  };

  const saveError = setBuiltin.error ?? updateRule.error;

  return (
    <>
      <div className="panel">
        <div className="panel-h">
          <b>Proofreading Rules</b>
          <span className="sync">
            {onCount} of {BUILTIN_RULES.length} on
          </span>
        </div>
        <div className="fd-note">
          Each time a caption, VO, Text on Image or Thumbnail Text on Image is saved, Frank proofreads it by these rules and lists
          what to fix; nothing changes until someone chooses Fix. Rules marked AI share one AI request per save; the rest are
          checked exactly, without AI. With every AI rule off, no request is made.
          {!canEdit && " Only Owners and Admins can change them."}
        </div>
        {saveError && <p className="autherr pr-err">{errorMessage(saveError, "Couldn't save that")}</p>}

        {BUILTIN_GROUPS.map((group) => (
          <div key={group} role="group" aria-label={group}>
            <div className="pr-group">{group}</div>
            {BUILTIN_RULES.filter((r) => r.group === group).map((r) => {
              const on = shownOn(r.key);
              return (
                <div className={`pr-row${on ? "" : " off"}`} key={r.key}>
                  <span className="pr-b">
                    <b>
                      {r.title}
                      {r.ai && <span className="pr-ai">AI</span>}
                    </b>
                    <span className="pr-d">{r.description}</span>

                    {r.key === "convention" && (
                      <label className="pr-opt">
                        <span>Spell in</span>
                        <select
                          className="sort"
                          aria-label="Spelling convention"
                          value={rules.convention}
                          disabled={!canEdit || setBuiltin.isPending}
                          onChange={(e) =>
                            flip("convention", rules.on("convention"), { convention: e.target.value as SpellingConvention })
                          }
                        >
                          <option value="follow">Whichever the copy uses</option>
                          <option value="british">British English</option>
                          <option value="american">American English</option>
                        </select>
                      </label>
                    )}

                    {r.key === "ai_phrases" && !phrasesOpen && (
                      <span className="pr-phrases">
                        {rules.phrases.length ? rules.phrases.join(", ") : "No phrases yet"}
                        {canEdit && (
                          <button
                            type="button"
                            className="pr-link"
                            onClick={() => {
                              setPhrasesText(rules.phrases.join("\n"));
                              setPhrasesOpen(true);
                            }}
                          >
                            Edit Phrases
                          </button>
                        )}
                      </span>
                    )}
                    {r.key === "ai_phrases" && phrasesOpen && (
                      <span className="pr-edit">
                        <textarea
                          id="pr-phrases"
                          className="bin"
                          rows={8}
                          aria-label="AI-sounding phrases, one a line"
                          value={phrasesText}
                          onChange={(e) => setPhrasesText(e.target.value)}
                        />
                        <span className="pr-hint">One a line. Frank also catches others plainly like them.</span>
                        <span className="kb-acts">
                          <button
                            type="button"
                            className="btn primary sm"
                            disabled={setBuiltin.isPending}
                            onClick={() =>
                              setBuiltin.mutate(
                                {
                                  key: "ai_phrases",
                                  enabled: rules.on("ai_phrases"),
                                  options: {
                                    phrases: [...new Set(phrasesText.split("\n").map((p) => p.trim()).filter(Boolean))],
                                  },
                                },
                                { onSuccess: () => setPhrasesOpen(false) },
                              )
                            }
                          >
                            {setBuiltin.isPending ? "Saving…" : "Save"}
                          </button>
                          <button
                            type="button"
                            className="btn sm"
                            disabled={phrasesText === DEFAULT_AI_PHRASES.join("\n")}
                            onClick={() => {
                              setCopied(null);
                              setResetting(true);
                            }}
                          >
                            Reset to Frank&rsquo;s List
                          </button>
                          <button type="button" className="btn sm" onClick={() => setPhrasesOpen(false)}>
                            Cancel
                          </button>
                        </span>
                      </span>
                    )}
                  </span>
                  <Switch
                    on={on}
                    label={r.title}
                    disabled={!canEdit || setBuiltin.isPending}
                    onChange={(next) => flip(r.key, next)}
                  />
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div className="panel">
        <div className="panel-h">
          <b>Your Rules</b>
          <span className="sync">
            {instructions.length} {instructions.length === 1 ? "rule" : "rules"}
          </span>
        </div>
        <div className="fd-note">
          Rules in your own words for Frank&rsquo;s AI to follow, such as &ldquo;Never use &amp; in a sentence&rdquo; or
          &ldquo;Write numbers under ten as words&rdquo;. They go in the same AI request, so they don&rsquo;t use any more.
        </div>
        {instructions.map((r) => (
          <div className={`pr-row${ownOn(r) ? "" : " off"}`} key={r.id}>
            {editing === r.id ? (
              <span className="pr-b pr-edit">
                <textarea
                  id={`pr-rule-${r.id}`}
                  className="bin"
                  rows={2}
                  aria-label="The rule"
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                />
                <span className="kb-acts">
                  <button
                    type="button"
                    className="btn primary sm"
                    disabled={updateRule.isPending || !editText.trim()}
                    onClick={() => updateRule.mutate({ id: r.id, body: editText.trim() }, { onSuccess: () => setEditing(null) })}
                  >
                    {updateRule.isPending ? "Saving…" : "Save"}
                  </button>
                  <button type="button" className="btn sm" onClick={() => setEditing(null)}>
                    Cancel
                  </button>
                </span>
              </span>
            ) : (
              <span className="pr-b">
                <span className="pr-own">{r.body}</span>
                {canEdit && (
                  <span className="pr-acts">
                    <button
                      type="button"
                      className="pr-link"
                      onClick={() => {
                        setEditText(r.body ?? "");
                        setEditing(r.id);
                      }}
                    >
                      Edit
                    </button>
                    <button type="button" className="pr-link" onClick={() => setRemoving(r)}>
                      Remove
                    </button>
                  </span>
                )}
              </span>
            )}
            <Switch
              on={ownOn(r)}
              label={r.body ?? "Rule"}
              disabled={!canEdit || updateRule.isPending}
              onChange={(next) => updateRule.mutate({ id: r.id, enabled: next })}
            />
          </div>
        ))}
        {!instructions.length && adding !== "instruction" && <p className="kb-empty">No rules of your own yet</p>}
        {adding === "instruction" && (
          <div className="pr-row">
            <span className="pr-b pr-edit">
              <textarea
                id="pr-new-rule"
                className="bin"
                rows={2}
                autoFocus
                aria-label="The rule"
                placeholder="Never use & in a sentence."
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
              />
              {addRule.error && <span className="autherr">{errorMessage(addRule.error, "Couldn't add it")}</span>}
              <span className="kb-acts">
                <button
                  type="button"
                  className="btn primary sm"
                  disabled={addRule.isPending || !draft.trim()}
                  onClick={() => addRule.mutate({ kind: "instruction", body: draft.trim() }, { onSuccess: closeAdd })}
                >
                  {addRule.isPending ? "Saving…" : "Save"}
                </button>
                <button type="button" className="btn sm" onClick={closeAdd}>
                  Cancel
                </button>
              </span>
            </span>
          </div>
        )}
        {canEdit && adding !== "instruction" && (
          <div className="kb-foot">
            <button
              type="button"
              className="fbtn"
              onClick={() => {
                closeAdd();
                setAdding("instruction");
              }}
            >
              Add Rule
            </button>
          </div>
        )}
      </div>

      <div className="panel">
        <div className="panel-h">
          <b>Preferred Words</b>
          <span className="sync">
            {words.length} {words.length === 1 ? "word" : "words"}
          </span>
        </div>
        <div className="fd-note">
          Always write one word or phrase as another, such as e-commerce as ecommerce. Checked exactly, without AI. When the two
          differ only by capitals (Linkedin as LinkedIn), the capitals are what&rsquo;s checked.
        </div>
        {words.map((r) => (
          <div className={`pr-row${ownOn(r) ? "" : " off"}`} key={r.id}>
            <span className="pr-b">
              <span className="pr-own">
                <del>{r.from_word}</del> <span aria-hidden="true">→</span> <ins>{r.to_word || "(leave out)"}</ins>
              </span>
              {canEdit && (
                <span className="pr-acts">
                  <button type="button" className="pr-link" onClick={() => setRemoving(r)}>
                    Remove
                  </button>
                </span>
              )}
            </span>
            <Switch
              on={ownOn(r)}
              label={`${r.from_word} as ${r.to_word}`}
              disabled={!canEdit || updateRule.isPending}
              onChange={(next) => updateRule.mutate({ id: r.id, enabled: next })}
            />
          </div>
        ))}
        {!words.length && adding !== "word" && <p className="kb-empty">No preferred words yet</p>}
        {adding === "word" && (
          <div className="pr-row">
            <span className="pr-b pr-edit">
              <span className="pr-words">
                <input
                  id="pr-from"
                  className="bin one"
                  autoFocus
                  aria-label="Instead of"
                  placeholder="Instead of: e-commerce"
                  value={fromWord}
                  onChange={(e) => setFromWord(e.target.value)}
                />
                <span aria-hidden="true">→</span>
                <input
                  id="pr-to"
                  className="bin one"
                  aria-label="Write"
                  placeholder="Write: ecommerce"
                  value={toWord}
                  onChange={(e) => setToWord(e.target.value)}
                />
              </span>
              {addRule.error && <span className="autherr">{errorMessage(addRule.error, "Couldn't add it")}</span>}
              <span className="kb-acts">
                <button
                  type="button"
                  className="btn primary sm"
                  disabled={addRule.isPending || !fromWord.trim() || fromWord.trim() === toWord.trim()}
                  onClick={() =>
                    addRule.mutate({ kind: "word", from_word: fromWord.trim(), to_word: toWord.trim() }, { onSuccess: closeAdd })
                  }
                >
                  {addRule.isPending ? "Saving…" : "Save"}
                </button>
                <button type="button" className="btn sm" onClick={closeAdd}>
                  Cancel
                </button>
              </span>
            </span>
          </div>
        )}
        {canEdit && adding !== "word" && (
          <div className="kb-foot">
            <button
              type="button"
              className="fbtn"
              onClick={() => {
                closeAdd();
                setAdding("word");
              }}
            >
              Add Word
            </button>
          </div>
        )}
      </div>

      {resetting && (
        <ConfirmDialog
          title="Reset to Frank's list?"
          message="the phrases in the box will be replaced by Frank's 27, and your own will be lost once you save. Copy them first if you'd like to keep them."
          confirmLabel="Reset"
          tone="danger"
          onConfirm={() => {
            setPhrasesText(DEFAULT_AI_PHRASES.join("\n"));
            setResetting(false);
          }}
          onClose={() => setResetting(false)}
        >
          <div className="pr-copy">
            <pre>{phrasesText.trim() || "(empty)"}</pre>
            <button
              type="button"
              className={copied === "yes" ? "btn sm copied" : "btn sm primary"}
              disabled={copied === "yes" || !phrasesText.trim()}
              onClick={() =>
                navigator.clipboard.writeText(phrasesText.trim()).then(
                  () => setCopied("yes"),
                  () => setCopied("failed"),
                )
              }
            >
              {copied === "yes" ? "Copied" : "Copy List"}
            </button>
            {copied === "yes" && (
              <span className="bsaved" role="status">
                List copied. Paste it somewhere safe before you reset.
              </span>
            )}
            {copied === "failed" && (
              <span className="berr" role="status">
                Couldn&apos;t copy it here. Select the list above and copy it.
              </span>
            )}
          </div>
        </ConfirmDialog>
      )}

      {removing && (
        <ConfirmDialog
          title={removing.kind === "word" ? "Remove this word?" : "Remove this rule?"}
          message={removing.kind === "word" ? `${removing.from_word} → ${removing.to_word || "(leave out)"}` : removing.body ?? ""}
          confirmLabel="Remove"
          pendingLabel="Removing…"
          isPending={deleteRule.isPending}
          error={deleteRule.error}
          errorFallback="Couldn't remove it"
          tone="danger"
          onConfirm={() => deleteRule.mutate(removing.id, { onSuccess: () => setRemoving(null) })}
          onClose={() => {
            deleteRule.reset();
            setRemoving(null);
          }}
        />
      )}
    </>
  );
}
