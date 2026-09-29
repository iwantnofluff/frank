-- calendar_views gains a table_type column ----------------------------------
-- Scheduled and Continuous project tables have entirely different column
-- sets. Without this, a view saved from one would show up as a selectable
-- (but nonsensical) tab on the other — calendar_views had no dimension for
-- "which table's columns does this describe" at all. Existing rows all came
-- from the Scheduled table (Continuous had no saved-views feature before
-- this), so they default to 'scheduled'.

alter table calendar_views
  add column table_type text not null default 'scheduled'
  check (table_type in ('scheduled', 'continuous'));

drop index calendar_views_agency_name_key;

create unique index calendar_views_agency_table_type_name_key
  on calendar_views (agency_id, table_type, lower(name));
