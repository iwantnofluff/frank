"use client";

import { use, useState, type ReactNode } from "react";
import { SettingsHead } from "@/components/settings/SettingsHead";
import { useMyAgency } from "@/hooks/use-my-agency";
import { useMyMembership } from "@/hooks/use-my-membership";
import {
  useClientPreferences,
  useSaveClientPreferences,
  type ClientPreferences,
} from "@/hooks/use-client-preferences";
import { seesAllClients } from "@/lib/roles";
import { errorMessage } from "@/lib/errors";

// Client Settings → Preferences (direct instruction, phase70): how Frank
// works for this client. Owners and Admins change them, each the moment it's
// picked; a User sees them read only.
export default function ClientPreferencesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: prefs, isLoading, error } = useClientPreferences(id);
  const save = useSaveClientPreferences(id);
  const { data: agency } = useMyAgency();
  const { data: me } = useMyMembership(agency?.agencyId);
  const canEdit = !!me && !me.client_id && seesAllClients(me.role);
  const set = (patch: Partial<ClientPreferences>) => save.mutate(patch);

  return (
    <div className="pad narrow">
      <SettingsHead title="Preferences" description="How Frank works for this client." />
      {isLoading && <p className="sub">Frank is working…</p>}
      {error && <p className="autherr">{errorMessage(error, "Couldn't load these preferences")}</p>}
      {prefs && (
        <>
          {!canEdit && <p className="note">Only Owners and Admins can change these.</p>}
          {save.error && <p className="autherr">{errorMessage(save.error, "Couldn't save that change")}</p>}

          <section className="panel">
            <div className="panel-h">
              <b>Approved Artwork</b>
              {save.isSuccess && !save.isPending && <span className="sync">Saved</span>}
            </div>
            <Row title="Keep artwork for" hint="After an Approved post's live date. Its copy and comments always stay.">
              <select
                aria-label="Keep artwork for"
                value={prefs.artwork_keep_days}
                disabled={!canEdit}
                onChange={(e) => set({ artwork_keep_days: Number(e.target.value) as ClientPreferences["artwork_keep_days"] })}
              >
                {[7, 14, 21, 28].map((d) => (
                  <option key={d} value={d}>
                    {d} days
                  </option>
                ))}
              </select>
            </Row>
            <Row
              title="Approved posts with no live date"
              hint={`Counted from the due date, or the approval if there's none, after ${prefs.artwork_keep_days} days.`}
            >
              <select
                aria-label="Approved posts with no live date"
                value={prefs.undated_artwork}
                disabled={!canEdit}
                onChange={(e) => set({ undated_artwork: e.target.value as ClientPreferences["undated_artwork"] })}
              >
                <option value="ask">Ask Owners and Admins</option>
                <option value="remove">Remove the artwork</option>
              </select>
            </Row>
          </section>

          <section className="panel">
            <div className="panel-h">
              <b>Our Promise</b>
            </div>
            <Row
              title="Send to the client at least"
              hint="How long before a post goes live it should reach the client for review. Analytics measures every post against it."
            >
              <select
                aria-label="Send to the client at least"
                value={prefs.lead_days}
                disabled={!canEdit}
                onChange={(e) => set({ lead_days: Number(e.target.value) as ClientPreferences["lead_days"] })}
              >
                {[14, 21, 28, 35].map((d) => (
                  <option key={d} value={d}>
                    {d === 28 ? "4 weeks" : d === 35 ? "5 weeks" : `${d / 7} weeks`} before live
                  </option>
                ))}
              </select>
            </Row>
            <Row
              title="Posts a month (contract)"
              hint="What the contract promises. Analytics compares it with the approved posts going live each month."
            >
              <ContractPosts
                key={prefs.contracted_posts_per_month ?? "none"}
                value={prefs.contracted_posts_per_month}
                disabled={!canEdit}
                onSave={(n) => set({ contracted_posts_per_month: n })}
              />
            </Row>
          </section>

          <section className="panel">
            <div className="panel-h">
              <b>Review Links</b>
            </div>
            <Row title="Client can approve" hint="When No, the client can comment on review links but not approve; the agency approves.">
              <YesNo
                label="Client can approve"
                value={prefs.client_can_approve}
                disabled={!canEdit}
                onChange={(v) => set({ client_can_approve: v })}
              />
            </Row>
            <Row
              title="Feed shows other posts"
              hint="The project's other posts in a review link's Feed: their stage, and their name while in Internal Review."
            >
              <YesNo
                label="Feed shows other posts"
                value={prefs.feed_shows_other_posts}
                disabled={!canEdit}
                onChange={(v) => set({ feed_shows_other_posts: v })}
              />
            </Row>
          </section>

          {/* When the client comments or approves (phase80, direct
              instruction): how the team hears, and who. */}
          <section className="panel">
            <div className="panel-h">
              <b>Notifications</b>
              <span className="sync">When the client comments or approves</span>
            </div>
            <Row title="In Frank" hint="A notice in the bell at the top right.">
              <YesNo
                label="Notify in Frank"
                value={prefs.notify_in_app}
                disabled={!canEdit}
                onChange={(v) => set({ notify_in_app: v })}
              />
            </Row>
            <Row title="By email" hint="An email as it happens.">
              <YesNo
                label="Notify by email"
                value={prefs.notify_email}
                disabled={!canEdit}
                onChange={(v) => set({ notify_email: v })}
              />
            </Row>
            <Row
              title="Who hears"
              hint={
                prefs.notify_who === "lead"
                  ? "The post's lead. A post with no lead: everyone on the client."
                  : prefs.notify_who === "everyone"
                    ? "Everyone on the team who can see the post."
                    : "The Primary Owner, Owners and Admins."
              }
            >
              <select
                aria-label="Who hears"
                value={prefs.notify_who}
                disabled={!canEdit || (!prefs.notify_in_app && !prefs.notify_email)}
                onChange={(e) => set({ notify_who: e.target.value as ClientPreferences["notify_who"] })}
              >
                <option value="lead">The post&apos;s lead</option>
                <option value="everyone">Everyone on the client</option>
                <option value="admins">Owners and Admins</option>
              </select>
            </Row>
          </section>

          <section className="panel">
            <div className="panel-h">
              <b>New Review Links</b>
              <span className="sync">What the Share window starts with</span>
            </div>
            <Row title="Can approve" hint={prefs.client_can_approve ? "Whether a new link lets the client approve." : "Off while the client can't approve."}>
              <YesNo
                label="New links can approve"
                value={prefs.client_can_approve && prefs.link_can_approve}
                disabled={!canEdit || !prefs.client_can_approve}
                onChange={(v) => set({ link_can_approve: v })}
              />
            </Row>
            <Row title="Link expires">
              <select
                aria-label="New links expire"
                value={prefs.link_expires_days}
                disabled={!canEdit}
                onChange={(e) => set({ link_expires_days: Number(e.target.value) as ClientPreferences["link_expires_days"] })}
              >
                <option value={7}>In 7 days</option>
                <option value={14}>In 14 days</option>
                <option value={30}>In 30 days</option>
                <option value={0}>Never</option>
              </select>
            </Row>
            <Row title="Passcode" hint="Each link's own passcode is still typed in the Share window.">
              <select
                aria-label="New links need a passcode"
                value={prefs.link_passcode ? "on" : "off"}
                disabled={!canEdit}
                onChange={(e) => set({ link_passcode: e.target.value === "on" })}
              >
                <option value="off">Off</option>
                <option value="on">On</option>
              </select>
            </Row>
          </section>
        </>
      )}
    </div>
  );
}

function Row({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <div className="srow">
      <span className="sl">
        <b>{title}</b>
        {hint && <span>{hint}</span>}
      </span>
      {children}
    </div>
  );
}

function YesNo({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: boolean;
  disabled: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <select aria-label={label} value={value ? "yes" : "no"} disabled={disabled} onChange={(e) => onChange(e.target.value === "yes")}>
      <option value="yes">Yes</option>
      <option value="no">No</option>
    </select>
  );
}

// The contract's posts a month: typed, then saved on leaving the box (or
// Enter); empty means not set.
function ContractPosts({ value, disabled, onSave }: { value: number | null; disabled: boolean; onSave: (n: number | null) => void }) {
  const [draft, setDraft] = useState(value === null ? "" : String(value));
  const commit = () => {
    const n = draft.trim() === "" ? null : Math.max(0, Math.min(1000, Math.round(Number(draft))));
    if (n !== null && Number.isNaN(n)) return setDraft(value === null ? "" : String(value));
    if (n !== value) onSave(n);
  };
  return (
    <input
      className="bin one"
      type="number"
      min={0}
      max={1000}
      inputMode="numeric"
      placeholder="Not set"
      aria-label="Posts a month (contract)"
      style={{ width: 110 }}
      value={draft}
      disabled={disabled}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
    />
  );
}
