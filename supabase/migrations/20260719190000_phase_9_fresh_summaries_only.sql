-- Bulletin summarizes fresh news only. Remove unstarted/retryable historical
-- summary work so the next provider quota window is not spent on old stories.
delete from public.cluster_summaries as summary
using public.story_clusters as cluster
where cluster.id = summary.cluster_id
  and summary.status in ('pending', 'retry-wait')
  and cluster.latest_event_at < statement_timestamp() - interval '48 hours';

create or replace function public.claim_cluster_summaries(
  p_worker_id uuid,
  p_batch_size integer default 5,
  p_lease_seconds integer default 300,
  p_now timestamptz default statement_timestamp()
)
returns table (summary_id uuid, cluster_id uuid, cluster_version integer, language public.briefing_language, lease_token uuid)
language sql
volatile
security invoker
set search_path = ''
as $$
  with expired as (
    delete from public.cluster_summaries as summary
    using public.story_clusters as cluster
    where cluster.id = summary.cluster_id
      and summary.status in ('pending', 'retry-wait')
      and cluster.latest_event_at < p_now - interval '48 hours'
    returning summary.id
  ), candidates as (
    select summary.id
    from public.cluster_summaries as summary
    join public.story_clusters as cluster on cluster.id = summary.cluster_id
    join public.system_controls as controls on controls.singleton
    where not controls.intelligence_worker_paused
      and cluster.latest_event_at >= p_now - interval '48 hours'
      and summary.status in ('pending', 'retry-wait', 'generating')
      and (
        (summary.status in ('pending', 'retry-wait') and summary.next_attempt_at <= p_now)
        or (summary.status = 'generating' and summary.lease_expires_at <= p_now)
      )
      and (summary.lease_expires_at is null or summary.lease_expires_at <= p_now)
      and summary.attempt_count < 5
      and cluster.status = 'verified'
      and cluster.current_version = summary.cluster_version
      and (summary.language = 'en' or exists (
        select 1 from public.cluster_summaries as canonical
        where canonical.cluster_id = summary.cluster_id
          and canonical.cluster_version = summary.cluster_version
          and canonical.language = 'en' and canonical.status = 'verified'
      ))
    order by case when summary.language = 'en' then 0 else 1 end,
      cluster.latest_event_at desc, summary.next_attempt_at,
      summary.cluster_id, summary.language
    for update of summary skip locked
    limit greatest(1, least(p_batch_size, 10))
  ), claimed as (
    update public.cluster_summaries as summary
    set status = 'generating', attempt_count = attempt_count + 1,
        lease_token = gen_random_uuid(), lease_owner = p_worker_id,
        lease_expires_at = p_now + make_interval(secs => greatest(60, least(p_lease_seconds, 900)))
    from candidates where summary.id = candidates.id
    returning summary.id, summary.cluster_id, summary.cluster_version,
      summary.language, summary.lease_token
  )
  select id, cluster_id, cluster_version, language, claimed.lease_token from claimed;
$$;

comment on function public.claim_cluster_summaries(uuid, integer, integer, timestamptz) is
  'Claims newest-first summary work from the last 48 hours and deletes stale unstarted or retryable jobs before they can consume provider quota.';

revoke execute on function public.claim_cluster_summaries(uuid, integer, integer, timestamptz)
  from public, anon, authenticated;
grant execute on function public.claim_cluster_summaries(uuid, integer, integer, timestamptz)
  to service_role;

