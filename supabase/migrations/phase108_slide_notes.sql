-- phase108: Notes for Designer, one per image (direct instruction: a
-- multi-image post, such as an Amazon Listing Image Set, has different
-- creative on each image). Kept on the post as Text on Image is
-- (phase57): one entry per slide, by position. The post's overall Notes
-- for Designer (cx.designer_notes) stays for direction covering the set.
alter table creatives
  add column if not exists slide_notes text[] not null default '{}';
