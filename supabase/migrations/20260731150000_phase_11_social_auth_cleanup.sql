-- Bulletin Phase 11: retire subscriber email-link auth after Supabase Auth adoption.

delete from public.subscribers
where status = 'pending';

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
    select id from public.admin_sessions
    where expires_at <= p_now or revoked_at is not null
    order by expires_at limit limited_batch
  )
  delete from public.admin_sessions as session using expired
  where session.id = expired.id;
  get diagnostics affected = row_count;
  result := result || jsonb_build_object('adminSessions', affected);

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

create or replace function public.create_authenticated_subscriber(
  p_auth_user_id uuid,
  p_email text,
  p_name text,
  p_country_code text,
  p_state_region text,
  p_city text,
  p_language public.briefing_language,
  p_categories public.news_category[],
  p_custom_topics text[],
  p_excluded_topics text[],
  p_story_count smallint,
  p_theme public.briefing_theme,
  p_frequency public.delivery_frequency,
  p_weekly_day public.weekday,
  p_local_delivery_time time without time zone,
  p_timezone text,
  p_consent_at timestamptz,
  p_consent_version text,
  p_now timestamptz default statement_timestamp()
)
returns table (subscriber_id uuid, outcome text, next_delivery_at timestamptz)
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  existing_subscriber public.subscribers%rowtype;
  created_id uuid;
  calculated_next timestamptz;
begin
  if p_auth_user_id is null
     or p_email is null
     or p_email <> lower(btrim(p_email)) then
    raise exception using errcode = '22023', message = 'invalid authenticated subscriber inputs';
  end if;

  select * into existing_subscriber
  from public.subscribers
  where auth_user_id = p_auth_user_id
  for update;

  if found and existing_subscriber.status in ('active', 'paused') then
    select schedule.next_delivery_at into calculated_next
    from public.subscriber_schedules as schedule
    where schedule.subscriber_id = existing_subscriber.id;

    return query select existing_subscriber.id, 'existing'::text, calculated_next;
    return;
  elsif found then
    delete from public.subscribers where id = existing_subscriber.id;
    existing_subscriber := null;
  end if;

  select * into existing_subscriber
  from public.subscribers
  where email = p_email
  for update;

  if found and existing_subscriber.auth_user_id is not null
     and existing_subscriber.auth_user_id <> p_auth_user_id then
    return query select existing_subscriber.id, 'email-claimed'::text, null::timestamptz;
    return;
  elsif found and existing_subscriber.status in ('active', 'paused') then
    update public.subscribers
    set auth_user_id = coalesce(auth_user_id, p_auth_user_id)
    where id = existing_subscriber.id;

    select schedule.next_delivery_at into calculated_next
    from public.subscriber_schedules as schedule
    where schedule.subscriber_id = existing_subscriber.id;

    return query select existing_subscriber.id, 'existing'::text, calculated_next;
    return;
  elsif found then
    delete from public.subscribers where id = existing_subscriber.id;
  end if;

  calculated_next := public.compute_next_delivery_at(
    p_now,
    p_frequency,
    p_weekly_day,
    p_local_delivery_time,
    p_timezone
  );

  insert into public.subscribers (
    auth_user_id, email, name, status, verified_at, consent_at, consent_version
  ) values (
    p_auth_user_id, p_email, p_name, 'active', p_now, p_consent_at,
    p_consent_version
  )
  returning id into created_id;

  insert into public.subscriber_preferences (
    subscriber_id, country_code, state_region, city, language, categories,
    custom_topics, excluded_topics, story_count, theme
  ) values (
    created_id, p_country_code, p_state_region, p_city, p_language, p_categories,
    p_custom_topics, p_excluded_topics, p_story_count, p_theme
  );

  insert into public.subscriber_schedules (
    subscriber_id, frequency, weekly_day, local_delivery_time, timezone,
    next_delivery_at
  ) values (
    created_id, p_frequency, p_weekly_day, p_local_delivery_time, p_timezone,
    calculated_next
  );

  return query select created_id, 'created'::text, calculated_next;
exception
  when unique_violation then
    return query
      select existing.id, 'existing'::text, schedule.next_delivery_at
      from public.subscribers as existing
      left join public.subscriber_schedules as schedule
        on schedule.subscriber_id = existing.id
      where existing.auth_user_id = p_auth_user_id
         or existing.email = p_email
      limit 1;
end;
$$;

create or replace function public.load_delivery_render_context(
  p_delivery_id uuid,
  p_lease_token uuid
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  context jsonb;
  expected_count integer;
  stored_count integer;
  valid_count integer;
begin
  select delivery.actual_story_count into expected_count
  from public.deliveries as delivery
  where delivery.id = p_delivery_id
    and delivery.lease_token = p_lease_token
    and delivery.status = 'claimed'
    and delivery.personalization_status = 'ready';
  if not found then
    raise exception using errcode = '55000', message = 'delivery-render-claim-invalid';
  end if;

  select count(*)::integer into stored_count
  from public.delivery_stories as story
  where story.delivery_id = p_delivery_id;
  if expected_count is null or stored_count <> expected_count then
    raise exception using errcode = '55000', message = 'delivery-story-count-mismatch';
  end if;

  select count(*)::integer into valid_count
  from public.delivery_stories as story
  join public.story_clusters as cluster
    on cluster.id = story.cluster_id
   and cluster.public_reference = story.cluster_public_reference
   and cluster.status = 'verified'
   and cluster.evidence_strength in ('sufficient', 'strong')
   and cluster.conflict_details = '[]'::jsonb
  join public.cluster_summaries as summary
    on summary.id = story.summary_id
   and summary.cluster_id = story.cluster_id
   and summary.cluster_version = story.cluster_version
   and summary.language = story.summary_language
   and summary.status = 'verified'
   and summary.verification_result @> '{"passed":true}'::jsonb
  where story.delivery_id = p_delivery_id
    and exists (
      select 1 from public.cluster_summary_articles as citation
      where citation.summary_id = summary.id
    );
  if valid_count <> expected_count then
    raise exception using errcode = '55000', message = 'delivery-evidence-no-longer-safe';
  end if;

  if exists (
    select 1
    from public.delivery_stories as story
    where story.delivery_id = p_delivery_id
      and story.position <> (
        select count(*) from public.delivery_stories as preceding
        where preceding.delivery_id = p_delivery_id
          and preceding.position <= story.position
      )
  ) then
    raise exception using errcode = '55000', message = 'delivery-story-order-invalid';
  end if;

  select jsonb_build_object(
    'deliveryId', delivery.id,
    'subscriberId', delivery.subscriber_id,
    'recipient', subscriber.email,
    'subscriberName', subscriber.name,
    'scheduledFor', delivery.scheduled_for,
    'preferenceVersion', delivery.preference_version,
    'language', delivery.language,
    'theme', delivery.theme,
    'timezone', schedule.timezone,
    'actualStoryCount', delivery.actual_story_count,
    'attemptCount', delivery.attempt_count,
    'stories', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'position', story.position,
          'clusterPublicReference', story.cluster_public_reference,
          'clusterVersion', story.cluster_version,
          'summaryId', story.summary_id,
          'category', cluster.category,
          'headline', summary.headline,
          'summary', summary.summary,
          'whyItMatters', summary.why_it_matters,
          'isUpdate', story.is_update,
          'sources', (
            select jsonb_agg(
              jsonb_build_object(
                'name', source.publisher_name,
                'url', article.canonical_url,
                'iconUrl', source.publisher_icon_url
              ) order by citation.citation_order
            )
            from public.cluster_summary_articles as citation
            join public.articles as article on article.id = citation.article_id
            join public.sources as source on source.id = article.source_id
            where citation.summary_id = summary.id
          )
        ) order by story.position
      )
      from public.delivery_stories as story
      join public.story_clusters as cluster on cluster.id = story.cluster_id
      join public.cluster_summaries as summary on summary.id = story.summary_id
      where story.delivery_id = delivery.id
    ), '[]'::jsonb)
  ) into context
  from public.deliveries as delivery
  join public.subscribers as subscriber on subscriber.id = delivery.subscriber_id
  join public.subscriber_schedules as schedule on schedule.subscriber_id = delivery.subscriber_id
  where delivery.id = p_delivery_id
    and delivery.lease_token = p_lease_token
    and delivery.status = 'claimed'
    and delivery.personalization_status = 'ready';

  if context is null then
    raise exception using errcode = '55000', message = 'delivery-render-context-missing';
  end if;
  return context;
end;
$$;

drop function if exists public.consume_verification_token_with_theme(
  bytea, public.briefing_theme, timestamptz
);
drop function if exists public.create_subscriber_session(
  uuid, bytea, bytea, bigint, timestamptz, timestamptz
);
drop function if exists public.validate_subscriber_session(bytea, bytea, timestamptz);
drop function if exists public.revoke_subscriber_session(bytea, timestamptz);
drop function if exists public.issue_verification_token(uuid, bytea, timestamptz);
drop function if exists public.inspect_verification_token(bytea, timestamptz);
drop function if exists public.consume_verification_token(bytea, timestamptz);
drop function if exists public.invalidate_subscriber_access(uuid, timestamptz);
drop function if exists public.create_pending_subscriber(
  text, text, text, text, text, public.briefing_language,
  public.news_category[], text[], text[], smallint, public.briefing_theme,
  public.delivery_frequency, public.weekday, time without time zone, text,
  timestamptz, text, timestamptz
);

drop table public.email_verification_tokens;
drop table public.subscriber_sessions;

alter table public.subscribers
  drop constraint subscribers_versions_check,
  drop column verification_generation,
  drop column token_version,
  drop column unverified_expires_at;

comment on function public.apply_retention is
  'Daily bounded cleanup for owner access, preferences, rate limits, deliveries, and shared news data.';
comment on function public.create_authenticated_subscriber is
  'Creates an active subscriber for a verified Supabase Auth user, or returns an existing account without duplicating email or auth ownership.';
comment on function public.load_delivery_render_context is
  'Returns the exact stored delivery snapshot needed for rendering without legacy subscriber access-link state.';
