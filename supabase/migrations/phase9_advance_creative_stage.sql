-- Phase 9 — Tighten creatives_update; add the one stage transition in scope
--
-- Background: docs/parity-gaps.md, "Stage transitions — scoped, not
-- built". A confirmed bug (creatives created via New Brief sit at stage 1
-- forever, so they never appear through a shared-review link, since
-- shared_link_allowed_creative_ids() unconditionally requires stage >= 5)
-- has no fix without a way to actually move a creative's stage. This
-- migration adds exactly the one transition scoped: staff can move a
-- creative from the internal band (1-4) to Client Review (5), and back.
-- Nothing else — no exception setting, no approval attribution, no audit
-- table. Those stay deferred.

-- Tighten creatives_update ------------------------------------------------
--
-- Found while scoping this: creatives_update's USING clause let a
-- client-role session write ANY column on a creative it can read — the
-- same broad "client owns this project" clause as creatives_select, with
-- nothing narrowing it to columns a client-review action might plausibly
-- touch. Confirmed by reading the policy, not assumed.
--
-- Narrowed to staff-only. The transition this migration adds is
-- staff-only per the current scope. If a client-permitted transition
-- (approving, say) is added later, it should go through its own
-- SECURITY DEFINER function — the pattern this schema already uses for
-- the guest path (get_shared_review/submit_shared_approval, phase6/
-- phase7_fix_pgcrypto_search_path.sql) — rather than widening this policy
-- back out to cover it.

drop policy if exists creatives_update on creatives;
create policy creatives_update on creatives
  for update using (is_agency_staff(agency_id));

-- advance_creative_stage — the only stage transition this pass builds ----
--
-- Legal moves only: internal band (stage < 5) -> Client Review (5), and
-- Client Review (5) -> back to Internal QC (4, the last internal stage —
-- matches the prototype's own $("#upSend") handler, which only ever
-- bumps a bare brief to stage 3 on first upload, never straight to
-- Client Review; there's no equivalent "send to review" transition
-- demonstrated anywhere in the prototype's actual script either, so this
-- is new ground, not a port). Anything else raises.
--
-- SECURITY DEFINER isn't load-bearing for staff here — creatives_update
-- above already lets them write stage directly — but the legal-move
-- check belongs in one place rather than trusting whatever a client
-- happens to send, and a narrow function is the extension point if a
-- client-permitted transition is ever added, per the note above. No
-- pgcrypto/extensions call in this function, so search_path is pinned to
-- `public` alone (not `public, extensions` — that widening was
-- specifically to fix functions calling crypt()/gen_salt(), which this
-- one doesn't; see phase7_fix_pgcrypto_search_path.sql).
create or replace function advance_creative_stage(p_creative_id uuid, p_direction text)
returns creatives
language plpgsql security definer set search_path = public as $$
declare
  v_creative creatives%rowtype;
begin
  select * into v_creative from creatives where id = p_creative_id;
  if not found then
    raise exception 'creative not found';
  end if;
  if not is_agency_staff(v_creative.agency_id) then
    raise exception 'not permitted';
  end if;

  if p_direction = 'to_review' then
    if v_creative.stage >= 5 then
      raise exception 'already at or past Client Review';
    end if;
    update creatives set stage = 5 where id = p_creative_id returning * into v_creative;
  elsif p_direction = 'to_internal' then
    if v_creative.stage != 5 then
      raise exception 'only a Client Review creative can move back to internal';
    end if;
    update creatives set stage = 4 where id = p_creative_id returning * into v_creative;
  else
    raise exception 'unknown direction: %', p_direction;
  end if;

  return v_creative;
end;
$$;

grant execute on function advance_creative_stage(uuid, text) to authenticated;
