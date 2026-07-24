create or replace function bulletin_private.preserve_capacity_deferred_summary_attempt()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'generating'
     and new.status = 'retry-wait'
     and new.last_error_code in ('local-verification-reserve', 'provider-rate-limited') then
    new.attempt_count := greatest(new.attempt_count - 1, 0);
  end if;
  return new;
end;
$$;

drop trigger if exists cluster_summaries_preserve_capacity_deferred_attempt
  on public.cluster_summaries;
create trigger cluster_summaries_preserve_capacity_deferred_attempt
before update of status, last_error_code on public.cluster_summaries
for each row execute function bulletin_private.preserve_capacity_deferred_summary_attempt();

create or replace function public.apply_news_retention(
  p_now timestamptz default statement_timestamp(),
  p_batch_size integer default 1000
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  limited_batch integer := greatest(1, least(p_batch_size, 5000));
  cutoff timestamptz := p_now - interval '48 hours';
  expired_cluster_ids uuid[];
  expired_article_ids uuid[];
  reset_retries integer := 0;
  finalized_retries integer := 0;
  deleted_clusters integer := 0;
  deleted_articles integer := 0;
begin
  update public.cluster_summaries as summary
  set attempt_count = 0
  from public.story_clusters as cluster
  where cluster.id = summary.cluster_id
    and cluster.latest_event_at >= cutoff
    and summary.status = 'retry-wait'
    and summary.last_error_code in ('local-verification-reserve', 'provider-rate-limited')
    and summary.attempt_count > 0;
  get diagnostics reset_retries = row_count;

  update public.cluster_summaries as summary
  set status = 'failed',
      last_error_code = 'retry-exhausted-' || left(coalesce(summary.last_error_code, 'unknown'), 80),
      lease_token = null,
      lease_owner = null,
      lease_expires_at = null
  from public.story_clusters as cluster
  where cluster.id = summary.cluster_id
    and cluster.latest_event_at >= cutoff
    and summary.status = 'retry-wait'
    and summary.attempt_count >= 5
    and coalesce(summary.last_error_code, '') not in (
      'local-verification-reserve', 'provider-rate-limited'
    );
  get diagnostics finalized_retries = row_count;

  select coalesce(array_agg(candidate.id), '{}'::uuid[])
  into expired_cluster_ids
  from (
    select cluster.id
    from public.story_clusters as cluster
    where cluster.latest_event_at < cutoff
    order by cluster.latest_event_at, cluster.id
    limit limited_batch
  ) as candidate;

  delete from public.story_clusters
  where id = any(expired_cluster_ids);
  get diagnostics deleted_clusters = row_count;

  select coalesce(array_agg(candidate.id), '{}'::uuid[])
  into expired_article_ids
  from (
    select article.id
    from public.articles as article
    where article.published_at < cutoff
    order by article.published_at, article.id
    limit limited_batch
  ) as candidate;

  delete from public.cluster_summary_articles
  where article_id = any(expired_article_ids);
  delete from public.story_cluster_articles
  where article_id = any(expired_article_ids);
  delete from public.articles
  where id = any(expired_article_ids);
  get diagnostics deleted_articles = row_count;

  return jsonb_build_object(
    'cutoff', cutoff,
    'resetCapacityRetries', reset_retries,
    'finalizedExhaustedRetries', finalized_retries,
    'deletedClusters', deleted_clusters,
    'deletedArticles', deleted_articles
  );
end;
$$;

comment on function public.apply_news_retention(timestamptz, integer) is
  'Bounded 48-hour news cleanup invoked by ingestion; removes expired clusters and articles, resets capacity deferrals, and finalizes genuinely exhausted retries.';

revoke execute on function public.apply_news_retention(timestamptz, integer)
  from public, anon, authenticated;
grant execute on function public.apply_news_retention(timestamptz, integer)
  to service_role;
