-- Phase 23a — add the two new agency_role values, on their own.
--
-- Must run as its own transaction, separate from phase23b: Postgres
-- forbids using a just-added enum value in the same transaction that
-- added it, and phase23b's Primary Owner unique index is a *partial*
-- index (`where role = 'primary_owner'`), which has to scan and evaluate
-- that predicate against the existing table at creation time — a real
-- use of the new value, not just inert text in a function body. Run
-- this file, confirm it succeeds, then run phase23b_staff_roles_and_client_access.sql
-- as a separate paste in the SQL editor.

alter type agency_role add value if not exists 'primary_owner';
alter type agency_role add value if not exists 'owner';
