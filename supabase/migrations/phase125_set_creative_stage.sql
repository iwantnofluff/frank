-- Phase 125 — moving a post to any stage, and status, from the table.
--
-- Decided directly (26 Oct 2026): the table's Status pill lists every
-- stage and status, and the team can move a post to any of them. One call
-- does both: the stage (by the same rules as the post's own stage switch,
-- advance_creative_stage, for Internal Review on; and back to Concept or
-- In Production, which that switch never offered), then the status picked,
-- or none for the stage alone. A post still in Concept moves on only once
-- its Concept is approved (approve_concept, which the page asks for
-- first), so that's refused here.

create or replace function set_creative_stage(p_creative_id uuid, p_stage int, p_status_id uuid default null)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v creatives%rowtype;
begin
  select * into v from creatives where id = p_creative_id;
  if not found then
    raise exception 'This post no longer exists';
  end if;
  if not is_agency_staff(v.agency_id) or not exists (
    select 1 from projects
    where id = v.project_id and client_id in (select staff_visible_client_ids(v.agency_id))
  ) then
    raise exception 'not permitted';
  end if;
  if p_stage not between 1 and 6 then
    raise exception 'unknown stage: %', p_stage;
  end if;
  if v.stage = 1 and p_stage > 1 then
    raise exception 'Approve the Concept first';
  end if;
  if p_status_id is not null and p_stage not in (2, 3) then
    raise exception 'Only In Production and Internal Review have statuses';
  end if;

  if p_stage <> v.stage then
    if p_stage in (1, 2) then
      update creatives
      set stage = p_stage, approved_at = null, approved_by_name = null, approved_by_email = null
      where id = p_creative_id;
    else
      perform advance_creative_stage(p_creative_id, case p_stage
        when 3 then 'to_internal' when 4 then 'to_review' when 5 then 'to_approved' else 'to_live' end);
    end if;
  end if;

  -- What was picked: a status, or the stage alone.
  if p_stage in (2, 3) then
    update creatives set status_id = p_status_id where id = p_creative_id and status_id is distinct from p_status_id;
  end if;
end;
$$;

revoke all on function set_creative_stage(uuid, int, uuid) from public, anon;
grant execute on function set_creative_stage(uuid, int, uuid) to authenticated;

notify pgrst, 'reload schema';
