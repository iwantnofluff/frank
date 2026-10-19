-- phase106: Ideas (direct instruction). A post with no date yet (no
-- Publish Date on a scheduled project, no Live Date on a continuous one)
-- is an Idea: the team's only. Clients don't see it anywhere, and a review
-- link never includes it, until it has a date. Its stage is kept as it is
-- and shows again the moment a date goes on.
--
-- A scheduled project's post no longer needs a Publish Date to exist (the
-- baseline refused one without); a continuous post still needs its
-- destination, as before. search_path pinned, as every SECURITY DEFINER
-- function's now is.
create or replace function check_creative_delivery_fields()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare
  project_delivery delivery_mode;
begin
  select delivery into project_delivery from projects where id = new.project_id;
  if project_delivery = 'continuous' and new.destination is null then
    raise exception 'destination is required on a creative in a continuous project';
  end if;
  return new;
end;
$$;

-- One test, "has a date, or the viewer is on the team", added to the read
-- rule on posts and to the two sets phase105 built every other read rule
-- from (versions, slides and comments follow from those).

create or replace function my_visible_creative_ids()
returns setof uuid
language sql stable security definer set search_path = public, extensions as $$
  select c.id from creatives c
  where c.project_id in (select my_visible_project_ids())
    and (c.scheduled_at is not null or c.due_on is not null
         or c.project_id in (select my_staff_visible_project_ids()));
$$;

create or replace function my_client_creative_ids()
returns setof uuid
language sql stable security definer set search_path = public, extensions as $$
  select c.id from creatives c
  where c.project_id in (select my_client_project_ids())
    and (c.scheduled_at is not null or c.due_on is not null);
$$;

alter policy creatives_select on creatives using (
  agency_id in (select current_agency_ids())
  and project_id in (select my_visible_project_ids())
  and (scheduled_at is not null or due_on is not null
       or project_id in (select my_staff_visible_project_ids()))
);

-- A review link's posts: the same as before, less any Idea.
create or replace function shared_link_allowed_creative_ids(v_link shared_links)
returns uuid[]
language sql stable security definer set search_path = public as $$
  select array_agg(id) from creatives
  where project_id = v_link.project_id
    and archived_at is null
    and (scheduled_at is not null or due_on is not null)
    and stage >= 4
    and (
      stage = 4
      or case v_link.scope
        when 'all' then true
        when 'pending' then false
        when 'one' then id = v_link.creative_id
        when 'pick' then id = any(v_link.picked_creatives)
        else false
      end
    );
$$;
