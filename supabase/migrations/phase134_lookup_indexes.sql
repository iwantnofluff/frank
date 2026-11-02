-- Indexes for columns the app looks rows up by, joins on, or that a delete
-- elsewhere has to search (speed pass, 2 Nov 2026). Each was a link to
-- another table with no index leading on it, so finding its rows meant
-- reading the whole table: replies to a comment, a post's share links and
-- activity, the notifications about a deleted comment or post, a file's
-- versions (assets' row rules), a person's project roles, a client's
-- staff and members. Columns only ever written (who made a row) are left
-- alone: an index costs a little on every insert.

create index if not exists comments_parent_id_idx on comments (parent_id);
create index if not exists comments_creative_version_id_idx on comments (creative_version_id);
create index if not exists comments_copy_version_id_idx on comments (copy_version_id);

create index if not exists notifications_comment_id_idx on notifications (comment_id);
create index if not exists notifications_creative_id_idx on notifications (creative_id);
create index if not exists notifications_discussion_id_idx on notifications (discussion_id);

create index if not exists shared_links_project_id_idx on shared_links (project_id);
create index if not exists shared_links_creative_id_idx on shared_links (creative_id);

create index if not exists project_activity_creative_id_idx on project_activity (creative_id);
create index if not exists project_discussion_parent_id_idx on project_discussion (parent_id);

create index if not exists projects_agency_id_idx on projects (agency_id);
create index if not exists projects_folder_id_idx on projects (folder_id);
create index if not exists assets_agency_id_idx on assets (agency_id);

create index if not exists creative_versions_asset_id_idx on creative_versions (asset_id);
create index if not exists creative_version_slides_asset_id_idx on creative_version_slides (asset_id);
create index if not exists thumbnail_versions_asset_id_idx on thumbnail_versions (asset_id);

create index if not exists proofreads_creative_id_idx on proofreads (creative_id);
create index if not exists creatives_status_id_idx on creatives (status_id);
create index if not exists calendar_views_project_id_idx on calendar_views (project_id);

create index if not exists project_roles_user_id_idx on project_roles (user_id);
create index if not exists staff_client_access_client_id_idx on staff_client_access (client_id);
create index if not exists memberships_client_id_idx on memberships (client_id);
create index if not exists instagram_connect_links_client_id_idx on instagram_connect_links (client_id);
