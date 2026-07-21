-- Bulletin Phase 10: fail-closed production bootstrap and strict fresh-news work.
-- New installations start with every worker and real email disabled. The owner
-- must enable stages deliberately after migrations, secrets, health, and backup
-- checks pass.
alter table public.system_controls
  alter column email_delivery_enabled set default false,
  alter column delivery_worker_paused set default true,
  alter column personalization_worker_paused set default true,
  alter column ingestion_worker_paused set default true,
  alter column intelligence_worker_paused set default true;

update public.system_controls
set email_delivery_enabled = false,
    delivery_worker_paused = true,
    personalization_worker_paused = true,
    ingestion_worker_paused = true,
    intelligence_worker_paused = true;

-- A clean catalogue should not make 48 simultaneous first-fetch requests.
-- The fixed per-feed interval remains exactly 30 minutes after first fetch.
with ranked as (
  select source.id,
         row_number() over (order by source.catalogue_key, source.id) - 1 as offset_minutes
  from public.sources as source
  where source.is_active
    and source.terms_status = 'approved'
    and source.technical_status = 'verified'
)
update public.sources as source
set next_fetch_at = statement_timestamp()
  + make_interval(mins => (ranked.offset_minutes % 30)::integer)
from ranked
where source.id = ranked.id;

-- Bulletin is not a historical archive. Old uncompleted article work is made
-- visible as quarantined instead of being sent to intelligence or a provider.
update public.articles
set processing_status = 'quarantined',
    last_error_code = 'stale-article',
    lease_token = null,
    lease_owner = null,
    lease_expires_at = null
where processing_status in ('pending', 'retry-wait', 'claimed')
  and published_at < statement_timestamp() - interval '48 hours';

create or replace function public.claim_articles(
  p_worker_id uuid,
  p_batch_size integer default 10,
  p_lease_seconds integer default 180,
  p_now timestamptz default statement_timestamp()
)
returns table (article_id uuid, lease_token uuid)
language sql
volatile
security invoker
set search_path = ''
as $$
  with stale as (
    update public.articles as article
    set processing_status = 'quarantined',
        last_error_code = 'stale-article',
        lease_token = null,
        lease_owner = null,
        lease_expires_at = null
    where article.processing_status in ('pending', 'retry-wait', 'claimed')
      and article.published_at < p_now - interval '48 hours'
      and (article.lease_expires_at is null or article.lease_expires_at <= p_now)
    returning article.id
  ), candidates as (
    select article.id
    from public.articles as article
    join public.system_controls as controls on controls.singleton
    where not controls.intelligence_worker_paused
      and article.published_at >= p_now - interval '48 hours'
      and article.processing_status in ('pending', 'retry-wait', 'claimed')
      and article.duplicate_of_article_id is null
      and article.duplicate_kind is null
      and (
        (article.processing_status in ('pending', 'retry-wait') and article.next_processing_at <= p_now)
        or (article.processing_status = 'claimed' and article.lease_expires_at <= p_now)
      )
      and article.processing_attempts < 5
      and (article.lease_expires_at is null or article.lease_expires_at <= p_now)
    order by article.published_at desc, article.next_processing_at, article.id
    for update of article skip locked
    limit greatest(1, least(p_batch_size, 25))
  ), claimed as (
    update public.articles as article
    set processing_status = 'claimed',
        processing_attempts = processing_attempts + 1,
        lease_token = gen_random_uuid(),
        lease_owner = p_worker_id,
        lease_expires_at = p_now + make_interval(secs => greatest(60, least(p_lease_seconds, 900)))
    from candidates
    where article.id = candidates.id
    returning article.id, article.lease_token
  )
  select id, claimed.lease_token from claimed;
$$;

comment on function public.claim_articles(uuid, integer, integer, timestamptz) is
  'Quarantines expired uncompleted article work and claims only newest-first work published within the last 48 hours; bounded, leased, kill-switch controlled, and overlap-safe.';

revoke execute on function public.claim_articles(uuid, integer, integer, timestamptz)
  from public, anon, authenticated;
grant execute on function public.claim_articles(uuid, integer, integer, timestamptz)
  to service_role;
