-- Briefings use a rolling news window, so newly published due articles must
-- not wait behind a one-time historical import. Fresh work is ordered newest
-- first; once it drains, the original due-time ordering clears older backlog.
-- Lease recovery, attempt limits, worker controls, and SKIP LOCKED semantics
-- remain unchanged.
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
  with candidates as (
    select article.id
    from public.articles as article
    join public.system_controls as controls on controls.singleton
    where not controls.intelligence_worker_paused
      and article.processing_status in ('pending', 'retry-wait', 'claimed')
      and article.duplicate_of_article_id is null
      and article.duplicate_kind is null
      and (
        (article.processing_status in ('pending', 'retry-wait') and article.next_processing_at <= p_now)
        or (article.processing_status = 'claimed' and article.lease_expires_at <= p_now)
      )
      and article.processing_attempts < 5
      and (article.lease_expires_at is null or article.lease_expires_at <= p_now)
    order by
      case when article.published_at >= p_now - interval '48 hours' then 0 else 1 end,
      case when article.published_at >= p_now - interval '48 hours' then article.published_at end desc,
      article.next_processing_at,
      article.published_at,
      article.id
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
  'Claims due intelligence work with a 48-hour freshness lane before draining older backlog; bounded, leased, and overlap-safe.';

revoke execute on function public.claim_articles(uuid, integer, integer, timestamptz)
  from public, anon, authenticated;
grant execute on function public.claim_articles(uuid, integer, integer, timestamptz)
  to service_role;
