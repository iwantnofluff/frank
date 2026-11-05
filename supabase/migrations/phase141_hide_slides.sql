-- Slides hidden in a Content Planner's Main Table by default (direct
-- instruction, 5 Nov 2026). New projects get it from DEFAULT_HIDDEN_COLUMNS
-- in ProjectCalendarTable.tsx; this adds it to every existing planner's
-- hidden columns, keeping whatever else each one hides. Saved table views
-- are left as they are.
update projects
set default_hidden_columns = array_append(default_hidden_columns, 'slides')
where delivery = 'scheduled'
  and not ('slides' = any(default_hidden_columns));
