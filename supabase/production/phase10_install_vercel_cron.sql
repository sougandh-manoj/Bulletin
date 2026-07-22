-- Bulletin Phase 10 production-only scheduler installation.
--
-- Run this in the hosted Supabase SQL editor only after:
--   1. the Vercel production deployment is healthy over HTTPS;
--   2. Vault contains exactly one `bulletin_app_base_url` secret containing
--      only the HTTPS origin (for example https://example.vercel.app); and
--   3. Vault contains exactly one `bulletin_cron_shared_secret` value matching
--      Vercel's CRON_SHARED_SECRET (minimum 32 characters).
--
-- This file contains no credential values and is intentionally not a normal
-- migration: local Supabase does not ship pg_cron, and external scheduling
-- must never begin merely because schema migrations were applied.

begin;

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create or replace function bulletin_private.invoke_vercel_worker(p_path text)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, bulletin_private, vault, net
as $$
declare
  v_base_url text;
  v_shared_secret text;
  v_request_id bigint;
begin
  if p_path not in (
    '/api/internal/ingestion',
    '/api/internal/intelligence',
    '/api/internal/shared-summaries',
    '/api/internal/personalization',
    '/api/internal/delivery'
  ) then
    raise exception using errcode = '22023', message = 'unsupported-bulletin-worker-path';
  end if;

  select decrypted_secret
  into strict v_base_url
  from vault.decrypted_secrets
  where name = 'bulletin_app_base_url';

  select decrypted_secret
  into strict v_shared_secret
  from vault.decrypted_secrets
  where name = 'bulletin_cron_shared_secret';

  v_base_url := rtrim(btrim(v_base_url), '/');
  if v_base_url !~ '^https://[A-Za-z0-9.-]+(:[0-9]+)?$' then
    raise exception using errcode = '22023', message = 'invalid-bulletin-https-origin';
  end if;
  if char_length(v_shared_secret) < 32 then
    raise exception using errcode = '22023', message = 'invalid-bulletin-cron-secret';
  end if;

  select net.http_post(
    url := v_base_url || p_path,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_shared_secret,
      'Content-Type', 'application/json',
      'User-Agent', 'Bulletin-Supabase-Cron/1.0'
    ),
    body := jsonb_build_object(
      'scheduled_at', clock_timestamp(),
      'scheduler', 'supabase-cron'
    ),
    timeout_milliseconds := 300000
  ) into v_request_id;

  return v_request_id;
exception
  when no_data_found then
    raise exception using errcode = '55000', message = 'bulletin-cron-vault-secret-missing';
  when too_many_rows then
    raise exception using errcode = '55000', message = 'bulletin-cron-vault-secret-duplicated';
end;
$$;

revoke all on function bulletin_private.invoke_vercel_worker(text) from public, anon, authenticated, service_role;

-- Idempotent replacement is limited to Bulletin-owned job names.
select cron.unschedule(jobid)
from cron.job
where jobname in (
  'bulletin-ingestion',
  'bulletin-intelligence',
  'bulletin-shared-summaries',
  'bulletin-personalization',
  'bulletin-delivery'
);

-- Resolve and validate Vault now. A missing, duplicate, non-HTTPS, or short
-- secret aborts this transaction before any recurring job is installed.
select bulletin_private.invoke_vercel_worker('/api/internal/ingestion');

select cron.schedule(
  'bulletin-ingestion',
  '*/5 * * * *',
  $job$select bulletin_private.invoke_vercel_worker('/api/internal/ingestion')$job$
);
select cron.schedule(
  'bulletin-intelligence',
  '* * * * *',
  $job$select bulletin_private.invoke_vercel_worker('/api/internal/intelligence')$job$
);
select cron.schedule(
  'bulletin-shared-summaries',
  '*/5 * * * *',
  $job$select bulletin_private.invoke_vercel_worker('/api/internal/shared-summaries')$job$
);
select cron.schedule(
  'bulletin-personalization',
  '* * * * *',
  $job$select bulletin_private.invoke_vercel_worker('/api/internal/personalization')$job$
);
select cron.schedule(
  'bulletin-delivery',
  '* * * * *',
  $job$select bulletin_private.invoke_vercel_worker('/api/internal/delivery')$job$
);

commit;
