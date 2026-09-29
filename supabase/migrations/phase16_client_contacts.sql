-- client_contacts -----------------------------------------------------------
-- A real, agency-managed list of named contacts for a client — replaces the
-- "Primary Approver Email" field NewClientModal.tsx has always captured but
-- never persisted (confirmed empty end-to-end before this migration: it
-- never reached use-create-client.ts). Used two ways: staff edit this list
-- from the client's own edit modal, and a shared-review guest picks their
-- identity from it instead of freely typing a name/email (get_shared_review
-- below).

create table client_contacts (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies (id),
  client_id uuid not null references clients (id),
  name text not null,
  email text not null,
  created_at timestamptz not null default now(),
  archived_at timestamptz
);

create index client_contacts_client_idx on client_contacts (client_id) where archived_at is null;

alter table client_contacts enable row level security;

-- Same shape as custom_columns: staff manage the list; the client's own
-- members can read it (it's not sensitive — just names/emails of their own
-- team), but only staff write it.
create policy client_contacts_select on client_contacts
  for select using (
    agency_id in (select current_agency_ids())
    and (
      is_agency_staff(agency_id)
      or client_id in (select current_client_ids(client_contacts.agency_id))
    )
  );
create policy client_contacts_insert on client_contacts
  for insert with check (is_agency_staff(agency_id));
create policy client_contacts_update on client_contacts
  for update using (is_agency_staff(agency_id));
create policy client_contacts_delete on client_contacts
  for delete using (is_agency_staff(agency_id));

-- get_shared_review gains a contacts list ------------------------------------
-- One more lookup (the shared link's project -> its client) and one more
-- jsonb_agg, so the public review page's existing single data-fetch round
-- trip also returns who the guest can pick from — no second RPC needed.
create or replace function get_shared_review(p_token text, p_passcode text default null)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_link shared_links%rowtype;
  v_allowed_ids uuid[];
  v_project jsonb;
  v_creatives jsonb;
  v_client_id uuid;
  v_contacts jsonb;
begin
  select * into v_link from shared_links where token = p_token and revoked_at is null;

  if not found or (v_link.expires_at is not null and v_link.expires_at <= now()) then
    return jsonb_build_object('status', 'not_found');
  end if;

  if v_link.requires_passcode then
    if p_passcode is null or p_passcode = '' then
      return jsonb_build_object('status', 'passcode_required');
    end if;
    if crypt(p_passcode, v_link.passcode_hash) <> v_link.passcode_hash then
      return jsonb_build_object('status', 'passcode_required', 'invalid', true);
    end if;
  end if;

  v_allowed_ids := shared_link_allowed_creative_ids(v_link);

  select p.client_id, jsonb_build_object('id', p.id, 'name', p.name, 'delivery', p.delivery)
    into v_client_id, v_project
    from projects p where p.id = v_link.project_id;

  select coalesce(jsonb_agg(jsonb_build_object('id', cc.id, 'name', cc.name, 'email', cc.email) order by cc.name), '[]'::jsonb)
    into v_contacts
    from client_contacts cc
    where cc.client_id = v_client_id and cc.archived_at is null;

  select coalesce(jsonb_agg(c order by c.position), '[]'::jsonb) into v_creatives
  from (
    select
      cr.id, cr.name, cr.format, cr.stage, cr.position,
      cr.scheduled_at, cr.destination, cr.approved_at,
      (
        select jsonb_build_object(
          'version_no', cv.version_no, 'storage_key', a.storage_key,
          'mime_type', a.mime_type, 'filename', a.filename
        )
        from creative_versions cv join assets a on a.id = cv.asset_id
        where cv.creative_id = cr.id order by cv.version_no desc limit 1
      ) as asset,
      (
        select jsonb_build_object('version_no', cpv.version_no, 'fields', cpv.fields)
        from copy_versions cpv
        where cpv.creative_id = cr.id order by cpv.version_no desc limit 1
      ) as copy,
      (
        -- Public, non-deleted only — this is the strip that matters. Private
        -- comments and anything soft-deleted are never fetched, so there is
        -- no "filter it out before sending" step for a bug to skip.
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', cm.id,
          'author_name', coalesce(u.name, cm.guest_name),
          'body', cm.body,
          'created_at', cm.created_at
        ) order by cm.created_at), '[]'::jsonb)
        from comments cm left join users u on u.id = cm.author_id
        where cm.creative_id = cr.id and cm.visibility = 'public' and cm.deleted_at is null
      ) as comments
    from creatives cr
    where cr.id = any(v_allowed_ids)
  ) c;

  return jsonb_build_object(
    'status', 'ok',
    'scope', v_link.scope,
    'can_approve', v_link.can_approve,
    'project', v_project,
    'creatives', v_creatives,
    'contacts', v_contacts
  );
end;
$$;

grant execute on function get_shared_review(text, text) to anon, authenticated;
