-- Bulletin Phase 2: fail-closed RLS, least-exposure grants, and retention foundations.

create or replace function bulletin_private.set_cluster_retention()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.status = 'verified'
     and (old.status is distinct from new.status or old.current_version is distinct from new.current_version) then
    new.retention_until := statement_timestamp() + interval '30 days';
  elsif new.status in ('candidate', 'open') then
    new.retention_until := null;
  elsif new.retention_until is null then
    new.retention_until := statement_timestamp() + interval '30 days';
  end if;
  return new;
end;
$$;

create trigger story_clusters_set_retention
before update on public.story_clusters
for each row execute function bulletin_private.set_cluster_retention();

create or replace function public.apply_retention(
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
  affected integer;
  result jsonb := '{}'::jsonb;
begin
  with expired as (
    select id from public.subscriber_sessions
    where expires_at <= p_now or revoked_at is not null
    order by expires_at limit limited_batch
  )
  delete from public.subscriber_sessions as session using expired
  where session.id = expired.id;
  get diagnostics affected = row_count;
  result := result || jsonb_build_object('subscriberSessions', affected);

  with expired as (
    select id from public.admin_sessions
    where expires_at <= p_now or revoked_at is not null
    order by expires_at limit limited_batch
  )
  delete from public.admin_sessions as session using expired
  where session.id = expired.id;
  get diagnostics affected = row_count;
  result := result || jsonb_build_object('adminSessions', affected);

  with expired as (
    select id from public.email_verification_tokens
    where expires_at <= p_now or status <> 'active'
    order by expires_at limit limited_batch
  )
  delete from public.email_verification_tokens as token using expired
  where token.id = expired.id;
  get diagnostics affected = row_count;
  result := result || jsonb_build_object('verificationTokens', affected);

  with expired as (
    select id from public.admin_access_tokens
    where expires_at <= p_now or status <> 'active'
    order by expires_at limit limited_batch
  )
  delete from public.admin_access_tokens as token using expired
  where token.id = expired.id;
  get diagnostics affected = row_count;
  result := result || jsonb_build_object('adminTokens', affected);

  with expired as (
    select subscriber_id, version from public.preference_versions
    where retain_until <= p_now
    order by retain_until limit limited_batch
  )
  delete from public.preference_versions as version using expired
  where version.subscriber_id = expired.subscriber_id and version.version = expired.version;
  get diagnostics affected = row_count;
  result := result || jsonb_build_object('preferenceVersions', affected);

  with expired as (
    select scope, subject_hash, window_started_at from public.rate_limit_buckets
    where expires_at <= p_now
    order by expires_at limit limited_batch
  )
  delete from public.rate_limit_buckets as bucket using expired
  where bucket.scope = expired.scope
    and bucket.subject_hash = expired.subject_hash
    and bucket.window_started_at = expired.window_started_at;
  get diagnostics affected = row_count;
  result := result || jsonb_build_object('rateLimitBuckets', affected);

  with expired as (
    select id from public.subscribers
    where status = 'pending' and unverified_expires_at <= p_now
    order by unverified_expires_at limit limited_batch
  )
  delete from public.subscribers as subscriber using expired
  where subscriber.id = expired.id;
  get diagnostics affected = row_count;
  result := result || jsonb_build_object('unverifiedSubscribers', affected);

  with expired as (
    select id from public.deliveries
    where created_at <= p_now - interval '90 days'
      and status in ('sent', 'failed', 'cancelled')
    order by created_at limit limited_batch
  )
  delete from public.deliveries as delivery using expired
  where delivery.id = expired.id;
  get diagnostics affected = row_count;
  result := result || jsonb_build_object('deliveries', affected);

  with expired as (
    select id from public.story_clusters
    where retention_until is not null and retention_until <= p_now
    order by retention_until limit limited_batch
  )
  delete from public.story_clusters as cluster using expired
  where cluster.id = expired.id;
  get diagnostics affected = row_count;
  result := result || jsonb_build_object('storyClusters', affected);

  with expired as (
    select id from public.articles
    where raw_metadata is not null and raw_retain_until <= p_now
    order by raw_retain_until limit limited_batch
  )
  update public.articles as article
  set raw_metadata = null
  from expired
  where article.id = expired.id;
  get diagnostics affected = row_count;
  result := result || jsonb_build_object('rawArticlePayloads', affected);

  with expired as (
    select article.id
    from public.articles as article
    where article.created_at <= p_now - interval '30 days'
      and not exists (
        select 1 from public.story_cluster_articles as relation where relation.article_id = article.id
      )
      and not exists (
        select 1 from public.cluster_summary_articles as citation where citation.article_id = article.id
      )
    order by article.created_at limit limited_batch
  )
  delete from public.articles as article using expired
  where article.id = expired.id;
  get diagnostics affected = row_count;
  result := result || jsonb_build_object('orphanArticles', affected);

  return result;
end;
$$;

-- Public is the Data API schema, so every table is protected explicitly. Browser
-- roles receive no policy. The service-role policy documents the sole API role;
-- the role also carries BYPASSRLS on Supabase and must remain server-only.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'subscribers', 'subscriber_preferences', 'subscriber_schedules', 'preference_versions',
    'email_verification_tokens', 'subscriber_sessions', 'admin_access_tokens', 'admin_sessions',
    'rate_limit_buckets', 'sources', 'articles', 'story_clusters', 'story_cluster_articles',
    'cluster_summaries', 'cluster_summary_articles', 'deliveries', 'delivery_stories',
    'admin_audit_log', 'alert_events', 'worker_heartbeats'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('alter table public.%I force row level security', table_name);
    execute format(
      'create policy %I on public.%I for all to service_role using (true) with check (true)',
      table_name || '_service_role_only', table_name
    );
  end loop;
end;
$$;

revoke all on all tables in schema public from public, anon, authenticated;
revoke all on all sequences in schema public from public, anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;
revoke execute on all functions in schema bulletin_private from public, anon, authenticated;
revoke all on schema bulletin_private from public, anon, authenticated;

grant usage on schema public, bulletin_private, extensions to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
grant execute on all functions in schema public, bulletin_private to service_role;

-- New objects remain closed until a reviewed migration grants them deliberately.
alter default privileges in schema public revoke all on tables from public, anon, authenticated;
alter default privileges in schema public revoke all on sequences from public, anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
alter default privileges in schema bulletin_private revoke execute on functions from public, anon, authenticated;

comment on function public.apply_retention is
  'Daily bounded cleanup. Run repeatedly until counts reach zero; subscriber deletion still happens immediately through delete_subscriber.';
comment on schema bulletin_private is
  'Not exposed through the Data API. Contains trigger and validation helpers only.';
