-- Bulletin Phase 10: owner-approved clean news reset and conservative summary pacing.
--
-- Subscriber accounts, preferences, schedules, sources, sent delivery records,
-- production secrets, and provider quota counters are deliberately preserved.

begin;

do $reset$
declare
  article_count bigint;
  cluster_count bigint;
  relation_count bigint;
  summary_count bigint;
  citation_count bigint;
  cancelled_delivery_count bigint;
begin
  -- Normal migration replay stays fail-closed. The one-time reset runs only
  -- in the already configured hosted environment where pg_cron is installed.
  if not exists (
    select 1 from pg_catalog.pg_extension where extname = 'pg_cron'
  ) then
    return;
  end if;

  select count(*) into article_count from public.articles;
  select count(*) into cluster_count from public.story_clusters;
  select count(*) into relation_count from public.story_cluster_articles;
  select count(*) into summary_count from public.cluster_summaries;
  select count(*) into citation_count from public.cluster_summary_articles;

  update public.system_controls
  set email_delivery_enabled = false,
      delivery_worker_paused = true,
      personalization_worker_paused = true,
      ingestion_worker_paused = true,
      intelligence_worker_paused = true,
      updated_at = statement_timestamp()
  where singleton;

  update public.deliveries
  set status = 'cancelled',
      cancelled_at = statement_timestamp(),
      failure_code = 'news-catalog-reset',
      failure_class = 'owner-action',
      lease_token = null,
      lease_owner = null,
      lease_expires_at = null,
      personalization_lease_token = null,
      personalization_lease_owner = null,
      personalization_lease_expires_at = null,
      updated_at = statement_timestamp()
  where status in ('pending', 'claimed', 'rendering', 'sending', 'retry-wait');
  get diagnostics cancelled_delivery_count = row_count;

  delete from public.delivery_stories as story
  using public.deliveries as delivery
  where delivery.id = story.delivery_id
    and delivery.status <> 'sent';

  -- Cluster deletion cascades joins, summaries, and citations. Sent delivery
  -- rows retain their immutable public references while nullable live links
  -- are cleared by their existing foreign keys.
  delete from public.story_clusters;
  delete from public.articles;

  insert into public.admin_audit_log (
    action, target_type, outcome, safe_metadata
  ) values (
    'fresh-news-restart',
    'news-pipeline',
    'succeeded',
    jsonb_build_object(
      'articlesRemoved', article_count,
      'clustersRemoved', cluster_count,
      'clusterRelationsRemoved', relation_count,
      'summariesRemoved', summary_count,
      'summaryCitationsRemoved', citation_count,
      'deliveriesCancelled', cancelled_delivery_count,
      'subscriberDataPreserved', true,
      'sourceCataloguePreserved', true,
      'providerQuotaCountersPreserved', true
    )
  );

  -- Force a fresh conditional fetch and stagger the active catalogue four
  -- feeds per five-minute ingestion window instead of creating one burst.
  with active_sources as (
    select source.id,
           row_number() over (order by source.id) - 1 as position
    from public.sources as source
    where source.is_active and source.terms_status = 'approved'
  )
  update public.sources as source
  set health = 'unknown',
      last_fetch_at = null,
      next_fetch_at = statement_timestamp()
        + make_interval(mins => ((active_sources.position / 4)::integer * 5)),
      last_successful_fetch_at = null,
      consecutive_failures = 0,
      etag = null,
      last_modified = null,
      lease_token = null,
      lease_owner = null,
      lease_expires_at = null,
      last_http_status = null,
      last_response_bytes = null,
      last_effective_url = null,
      last_error_code = null,
      last_error_at = null,
      retry_after_at = null,
      last_article_count = 0,
      last_duplicate_count = 0,
      updated_at = statement_timestamp()
  from active_sources
  where source.id = active_sources.id;

  -- Ingestion and local title intelligence may restart immediately. Delivery
  -- remains paused until the fresh category inventory is demonstrably useful.
  update public.system_controls
  set ingestion_worker_paused = false,
      intelligence_worker_paused = false,
      updated_at = statement_timestamp()
  where singleton;
end
$reset$;

-- Production uses pg_cron; local migration replay does not. When available,
-- reduce the shared-summary worker from every minute to every five minutes.
do $schedule$
declare
  summary_job_id bigint;
begin
  if exists (
    select 1 from pg_catalog.pg_extension where extname = 'pg_cron'
  ) then
    for summary_job_id in execute
      'select jobid from cron.job where jobname = ''bulletin-shared-summaries'''
    loop
      execute format(
        'select cron.alter_job(job_id := %s, schedule := %L)',
        summary_job_id,
        '*/5 * * * *'
      );
    end loop;
  end if;
end
$schedule$;

commit;
