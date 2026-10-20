-- phase109: Destination is no longer asked for (direct instruction: it,
-- Funnel, TG and Final Creative went from Other Content's table and the
-- post window). The baseline refused a continuous post without one; its
-- other check (a scheduled post's Publish Date) went in phase106, so the
-- rule has nothing left to do. What posts already hold stays.
drop trigger if exists creatives_check_delivery_fields on creatives;
drop function if exists check_creative_delivery_fields();
