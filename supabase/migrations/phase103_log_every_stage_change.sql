-- Phase 103 — the stage log sees In Production.
--
-- phase102 moves a post to In Production in a before-trigger when its
-- Concept is written. creatives_log_stage (phase71) only fired on updates
-- that named stage or exception themselves, so that move went unlogged
-- (checked: a post's log read Concept, then Internal Review). The log now
-- looks at every update; log_creative_stage_event() already writes a row
-- only when the stage or exception really changed.

drop trigger if exists creatives_log_stage on creatives;
create trigger creatives_log_stage
  after insert or update on creatives
  for each row execute function log_creative_stage_event();

-- The moves already missed since phase102: each post now In Production
-- with no logged arrival there, as of its last change. By no one in
-- particular, as the database moved it.
insert into creative_stage_events (agency_id, creative_id, from_stage, to_stage, at)
select c.agency_id, c.id, 1, 2, c.updated_at
from creatives c
where c.stage = 2
  and not exists (select 1 from creative_stage_events e where e.creative_id = c.id and e.to_stage = 2);
