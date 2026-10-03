-- Phase 43 — "staging" is Frank's, not an agency's.
--
-- Decided directly (3 Oct 2026): a hosted staging copy of Frank lives at
-- staging.beingfrank.app, with its agencies at *.staging.beingfrank.app.
-- On the live site an agency called "staging" would sit at that same
-- address, so the name joins the reserved list (phase36).

alter table agencies drop constraint agencies_subdomain_format;
alter table agencies add constraint agencies_subdomain_format check (
  subdomain is null or (
    subdomain::text ~ '^[a-z0-9]([a-z0-9-]{0,30}[a-z0-9])$'
    and subdomain::text not in (
      'www', 'app', 'admin', 'api', 'mail', 'email', 'help', 'support', 'status',
      'blog', 'docs', 'login', 'signup', 'billing', 'static', 'assets', 'cdn', 'frank',
      'staging'
    )
  )
);
