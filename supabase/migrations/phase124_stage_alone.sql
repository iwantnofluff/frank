-- Phase 124 — a post can be in In Production or Internal Review with no
-- status, just the stage.
--
-- Decided directly (26 Oct 2026): the stage pill's dropdown leads with the
-- stage itself (2. Production, 3. Internal) before its statuses, and
-- picking it leaves the post on the stage alone. A post entering either
-- stage still takes the first status (phase123); only a post already
-- there can be set back to none, and that's kept.

create or replace function creatives_keep_status()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if new.stage not in (2, 3) then
    new.status_id := null;
    return new;
  end if;
  if tg_op = 'UPDATE' and new.stage is distinct from old.stage and new.status_id is not distinct from old.status_id then
    -- Moved stage without choosing a status: the new stage's first.
    new.status_id := first_project_status(new.project_id, new.stage::smallint);
  elsif new.status_id is null then
    -- A new post starts on the first; one already here may be on the
    -- stage alone.
    if tg_op = 'INSERT' then
      new.status_id := first_project_status(new.project_id, new.stage::smallint);
    end if;
  elsif not exists (
    select 1 from project_statuses
    where id = new.status_id and project_id = new.project_id and stage = new.stage
  ) then
    if tg_op = 'UPDATE' and new.status_id is distinct from old.status_id then
      raise exception 'That status isn''t one of this post''s stage';
    end if;
    new.status_id := first_project_status(new.project_id, new.stage::smallint);
  end if;
  return new;
end;
$$;

notify pgrst, 'reload schema';
