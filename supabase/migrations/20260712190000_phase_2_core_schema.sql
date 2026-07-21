-- Bulletin Phase 2: extensions, closed vocabularies, tables, constraints, and indexes.
-- Application writes use the transactional functions in the following migration.

create schema if not exists extensions;
create schema if not exists bulletin_private;

revoke all on schema bulletin_private from public, anon, authenticated;

create extension if not exists pgcrypto with schema extensions;
create extension if not exists vector with schema extensions;

create type public.subscriber_status as enum ('pending', 'active', 'paused');
create type public.briefing_language as enum ('en', 'hi', 'ml');
create type public.briefing_theme as enum ('light-editorial', 'dark-intelligence');
create type public.delivery_frequency as enum ('daily', 'weekdays', 'weekends', 'weekly');
create type public.weekday as enum (
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'
);
create type public.news_category as enum (
  'india',
  'world',
  'regional-local',
  'politics',
  'business-economy',
  'markets-personal-finance',
  'startups',
  'technology-ai',
  'science',
  'health',
  'education-careers',
  'government-schemes',
  'sports',
  'entertainment',
  'climate'
);
create type public.preference_change_reason as enum (
  'onboarding-initial', 'save-changes', 'theme-change', 'recovery'
);
create type public.token_status as enum ('active', 'consumed', 'invalidated');
create type public.rate_limit_scope as enum (
  'email-check', 'verification-request', 'management-request', 'token-validation', 'admin-access'
);
create type public.source_reliability as enum ('tier-1', 'tier-2', 'tier-3');
create type public.source_role as enum ('primary', 'supplementary');
create type public.source_health as enum ('unknown', 'healthy', 'degraded', 'failing', 'disabled');
create type public.terms_review_status as enum ('pending', 'approved', 'restricted', 'rejected');
create type public.article_processing_status as enum (
  'pending', 'claimed', 'processed', 'retry-wait', 'failed', 'quarantined'
);
create type public.story_cluster_status as enum (
  'candidate', 'open', 'verified', 'conflicted', 'quarantined'
);
create type public.evidence_strength as enum ('weak', 'sufficient', 'strong', 'conflicted');
create type public.cluster_join_decision as enum ('pending', 'accepted', 'rejected');
create type public.summary_status as enum (
  'pending', 'generating', 'verified', 'insufficient-evidence',
  'conflicting-evidence', 'invalid-input', 'failed'
);
create type public.delivery_status as enum (
  'pending', 'claimed', 'rendering', 'sending', 'retry-wait', 'sent', 'failed', 'cancelled'
);
create type public.audit_outcome as enum ('succeeded', 'failed', 'denied');
create type public.alert_severity as enum ('info', 'warning', 'critical');
create type public.alert_status as enum ('open', 'acknowledged', 'resolved');

create or replace function bulletin_private.text_array_is_normalized_unique(values_to_check text[])
returns boolean
language sql
immutable
strict
set search_path = ''
as $$
  select not exists (
    select 1
    from unnest(values_to_check) as item(value)
    where value = ''
       or value <> lower(btrim(value))
       or char_length(value) > 80
  )
  and cardinality(values_to_check) = (
    select count(distinct value) from unnest(values_to_check) as item(value)
  );
$$;

create or replace function bulletin_private.news_categories_are_unique(values_to_check public.news_category[])
returns boolean
language sql
immutable
strict
set search_path = ''
as $$
  select cardinality(values_to_check) = (
    select count(distinct value) from unnest(values_to_check) as item(value)
  );
$$;

create or replace function bulletin_private.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := statement_timestamp();
  return new;
end;
$$;

create table public.subscribers (
  id uuid primary key default gen_random_uuid(),
  public_reference uuid not null default gen_random_uuid(),
  email text not null,
  name text not null,
  status public.subscriber_status not null default 'pending',
  verified_at timestamptz,
  paused_at timestamptz,
  verification_generation bigint not null default 0,
  token_version bigint not null default 1,
  consent_at timestamptz not null,
  consent_version text not null,
  unverified_expires_at timestamptz not null default (statement_timestamp() + interval '7 days'),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint subscribers_public_reference_key unique (public_reference),
  constraint subscribers_email_key unique (email),
  constraint subscribers_email_normalized_check check (
    email = lower(btrim(email))
    and char_length(email) between 3 and 254
    and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  constraint subscribers_name_check check (
    name = btrim(name) and char_length(name) between 1 and 100
  ),
  constraint subscribers_versions_check check (
    verification_generation >= 0 and token_version >= 1
  ),
  constraint subscribers_consent_version_check check (char_length(btrim(consent_version)) between 1 and 50),
  constraint subscribers_status_check check (
    (status = 'pending' and verified_at is null and paused_at is null)
    or (status = 'active' and verified_at is not null and paused_at is null)
    or (status = 'paused' and verified_at is not null and paused_at is not null)
  )
);

create table public.subscriber_preferences (
  subscriber_id uuid primary key references public.subscribers(id) on delete cascade,
  country_code text not null,
  state_region text not null,
  city text,
  language public.briefing_language not null,
  categories public.news_category[] not null,
  custom_topics text[] not null default '{}',
  excluded_topics text[] not null default '{}',
  story_count smallint not null default 3,
  theme public.briefing_theme not null default 'light-editorial',
  version bigint not null default 1,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint subscriber_preferences_country_check check (country_code ~ '^[A-Z]{2}$'),
  constraint subscriber_preferences_state_check check (
    state_region = btrim(state_region) and char_length(state_region) between 1 and 100
  ),
  constraint subscriber_preferences_city_check check (
    city is null or (city = btrim(city) and char_length(city) between 1 and 100)
  ),
  constraint subscriber_preferences_categories_count_check check (cardinality(categories) between 1 and 8),
  constraint subscriber_preferences_categories_unique_check check (
    bulletin_private.news_categories_are_unique(categories)
  ),
  constraint subscriber_preferences_custom_topics_check check (
    cardinality(custom_topics) <= 5
    and bulletin_private.text_array_is_normalized_unique(custom_topics)
  ),
  constraint subscriber_preferences_excluded_topics_check check (
    cardinality(excluded_topics) <= 5
    and bulletin_private.text_array_is_normalized_unique(excluded_topics)
  ),
  constraint subscriber_preferences_story_count_check check (story_count between 1 and 10),
  constraint subscriber_preferences_version_check check (version >= 1)
);

create table public.subscriber_schedules (
  subscriber_id uuid primary key references public.subscribers(id) on delete cascade,
  frequency public.delivery_frequency not null,
  weekly_day public.weekday,
  local_delivery_time time(0) without time zone not null,
  timezone text not null,
  next_delivery_at timestamptz,
  last_scheduled_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint subscriber_schedules_weekly_day_check check (
    (frequency = 'weekly' and weekly_day is not null)
    or (frequency <> 'weekly' and weekly_day is null)
  ),
  constraint subscriber_schedules_timezone_check check (
    timezone = btrim(timezone) and char_length(timezone) between 1 and 100
  )
);

create table public.preference_versions (
  id bigint generated always as identity primary key,
  subscriber_id uuid not null references public.subscribers(id) on delete cascade,
  version bigint not null,
  reason public.preference_change_reason not null,
  snapshot jsonb not null,
  created_at timestamptz not null default statement_timestamp(),
  retain_until timestamptz not null default (statement_timestamp() + interval '30 days'),
  constraint preference_versions_subscriber_version_key unique (subscriber_id, version),
  constraint preference_versions_snapshot_object_check check (jsonb_typeof(snapshot) = 'object'),
  constraint preference_versions_retention_check check (retain_until >= created_at)
);

create table public.email_verification_tokens (
  id uuid primary key default gen_random_uuid(),
  subscriber_id uuid not null references public.subscribers(id) on delete cascade,
  token_hash bytea not null,
  generation bigint not null,
  status public.token_status not null default 'active',
  expires_at timestamptz not null,
  consumed_at timestamptz,
  invalidated_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  constraint email_verification_tokens_hash_key unique (token_hash),
  constraint email_verification_tokens_hash_length_check check (octet_length(token_hash) = 32),
  constraint email_verification_tokens_expiry_check check (expires_at > created_at),
  constraint email_verification_tokens_generation_check check (generation >= 1),
  constraint email_verification_tokens_status_check check (
    (status = 'active' and consumed_at is null and invalidated_at is null)
    or (status = 'consumed' and consumed_at is not null and invalidated_at is null)
    or (status = 'invalidated' and consumed_at is null and invalidated_at is not null)
  )
);

create unique index email_verification_tokens_one_active_per_subscriber_idx
  on public.email_verification_tokens (subscriber_id)
  where status = 'active';
create index email_verification_tokens_expiry_idx
  on public.email_verification_tokens (expires_at)
  where status = 'active';

create table public.subscriber_sessions (
  id uuid primary key default gen_random_uuid(),
  subscriber_id uuid not null references public.subscribers(id) on delete cascade,
  session_hash bytea not null,
  csrf_hash bytea not null,
  token_version bigint not null,
  expires_at timestamptz not null,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  constraint subscriber_sessions_hash_key unique (session_hash),
  constraint subscriber_sessions_hash_length_check check (
    octet_length(session_hash) = 32 and octet_length(csrf_hash) = 32
  ),
  constraint subscriber_sessions_token_version_check check (token_version >= 1),
  constraint subscriber_sessions_expiry_check check (expires_at > created_at)
);

create index subscriber_sessions_lookup_idx on public.subscriber_sessions (subscriber_id, expires_at)
  where revoked_at is null;
create index subscriber_sessions_expiry_idx on public.subscriber_sessions (expires_at);

create table public.admin_access_tokens (
  id uuid primary key default gen_random_uuid(),
  owner_email_hash bytea not null,
  token_hash bytea not null,
  status public.token_status not null default 'active',
  expires_at timestamptz not null,
  consumed_at timestamptz,
  invalidated_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  constraint admin_access_tokens_hash_key unique (token_hash),
  constraint admin_access_tokens_hash_length_check check (
    octet_length(owner_email_hash) = 32 and octet_length(token_hash) = 32
  ),
  constraint admin_access_tokens_expiry_check check (expires_at > created_at),
  constraint admin_access_tokens_status_check check (
    (status = 'active' and consumed_at is null and invalidated_at is null)
    or (status = 'consumed' and consumed_at is not null and invalidated_at is null)
    or (status = 'invalidated' and consumed_at is null and invalidated_at is not null)
  )
);

create index admin_access_tokens_expiry_idx on public.admin_access_tokens (expires_at)
  where status = 'active';

create table public.admin_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_email_hash bytea not null,
  session_hash bytea not null,
  csrf_hash bytea not null,
  expires_at timestamptz not null,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  constraint admin_sessions_hash_key unique (session_hash),
  constraint admin_sessions_hash_length_check check (
    octet_length(owner_email_hash) = 32
    and octet_length(session_hash) = 32
    and octet_length(csrf_hash) = 32
  ),
  constraint admin_sessions_expiry_check check (expires_at > created_at)
);

create index admin_sessions_expiry_idx on public.admin_sessions (expires_at);

create table public.rate_limit_buckets (
  scope public.rate_limit_scope not null,
  subject_hash bytea not null,
  window_started_at timestamptz not null,
  request_count integer not null default 1,
  expires_at timestamptz not null,
  primary key (scope, subject_hash, window_started_at),
  constraint rate_limit_buckets_hash_length_check check (octet_length(subject_hash) = 32),
  constraint rate_limit_buckets_count_check check (request_count >= 1),
  constraint rate_limit_buckets_expiry_check check (expires_at > window_started_at)
);

create index rate_limit_buckets_expiry_idx on public.rate_limit_buckets (expires_at);

create table public.sources (
  id uuid primary key default gen_random_uuid(),
  publisher_name text not null,
  feed_name text not null,
  feed_url text not null,
  publisher_domain text not null,
  category_scope public.news_category[],
  language public.briefing_language not null,
  country_code text,
  state_region text,
  expected_update_interval interval not null default interval '30 minutes',
  reliability public.source_reliability not null,
  role public.source_role not null,
  is_aggregator boolean not null default false,
  is_institutional boolean not null default false,
  terms_status public.terms_review_status not null default 'pending',
  terms_notes text,
  is_active boolean not null default false,
  health public.source_health not null default 'unknown',
  last_fetch_at timestamptz,
  next_fetch_at timestamptz,
  last_successful_fetch_at timestamptz,
  consecutive_failures integer not null default 0,
  etag text,
  last_modified text,
  parser_notes text,
  fallback_source_id uuid references public.sources(id) on delete set null,
  lease_token uuid,
  lease_owner uuid,
  lease_expires_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint sources_feed_url_key unique (feed_url),
  constraint sources_names_check check (
    char_length(btrim(publisher_name)) between 1 and 150
    and char_length(btrim(feed_name)) between 1 and 150
  ),
  constraint sources_country_check check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  constraint sources_failure_count_check check (consecutive_failures >= 0),
  constraint sources_interval_check check (expected_update_interval > interval '0 seconds'),
  constraint sources_activation_check check (not is_active or terms_status = 'approved'),
  constraint sources_lease_check check (
    (lease_token is null and lease_owner is null and lease_expires_at is null)
    or (lease_token is not null and lease_owner is not null and lease_expires_at is not null)
  )
);

create index sources_due_idx on public.sources (next_fetch_at, id)
  where is_active and terms_status = 'approved';
create index sources_health_idx on public.sources (health, consecutive_failures desc);

create table public.articles (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.sources(id) on delete restrict,
  original_title text not null,
  normalized_title text not null,
  description text,
  canonical_url text not null,
  canonical_url_hash bytea not null,
  normalized_title_hash bytea not null,
  author text,
  published_at timestamptz not null,
  declared_language public.briefing_language,
  country_code text,
  state_region text,
  city text,
  feed_categories text[] not null default '{}',
  raw_metadata jsonb,
  raw_retain_until timestamptz not null default (statement_timestamp() + interval '14 days'),
  classification jsonb,
  entities jsonb,
  embedding extensions.vector(768),
  embedding_model text,
  processing_status public.article_processing_status not null default 'pending',
  processing_attempts smallint not null default 0,
  next_processing_at timestamptz not null default statement_timestamp(),
  lease_token uuid,
  lease_owner uuid,
  lease_expires_at timestamptz,
  last_error_code text,
  processed_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint articles_canonical_url_hash_key unique (canonical_url_hash),
  constraint articles_hash_lengths_check check (
    octet_length(canonical_url_hash) = 32 and octet_length(normalized_title_hash) = 32
  ),
  constraint articles_title_check check (
    char_length(btrim(original_title)) between 1 and 1000
    and char_length(btrim(normalized_title)) between 1 and 1000
  ),
  constraint articles_country_check check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  constraint articles_attempts_check check (processing_attempts between 0 and 20),
  constraint articles_json_check check (
    (raw_metadata is null or jsonb_typeof(raw_metadata) = 'object')
    and (classification is null or jsonb_typeof(classification) = 'object')
    and (entities is null or jsonb_typeof(entities) = 'object')
  ),
  constraint articles_lease_check check (
    (lease_token is null and lease_owner is null and lease_expires_at is null)
    or (lease_token is not null and lease_owner is not null and lease_expires_at is not null)
  )
);

create index articles_processing_due_idx on public.articles (next_processing_at, published_at, id)
  where processing_status in ('pending', 'retry-wait');
create index articles_recent_candidates_idx on public.articles (published_at desc, source_id);
create index articles_normalized_title_hash_idx on public.articles (normalized_title_hash, published_at desc);
create index articles_raw_retention_idx on public.articles (raw_retain_until) where raw_metadata is not null;
create index articles_embedding_hnsw_idx on public.articles
  using hnsw (embedding extensions.vector_cosine_ops)
  where embedding is not null;

create table public.story_clusters (
  id uuid primary key default gen_random_uuid(),
  public_reference uuid not null default gen_random_uuid(),
  status public.story_cluster_status not null default 'candidate',
  category public.news_category not null,
  country_code text,
  state_region text,
  city text,
  central_topics text[] not null default '{}',
  entities jsonb not null default '{}'::jsonb,
  evidence_strength public.evidence_strength not null default 'weak',
  is_sensitive boolean not null default false,
  current_version integer not null default 1,
  meaningful_update_of_id uuid references public.story_clusters(id) on delete set null,
  representative_embedding extensions.vector(768),
  latest_event_at timestamptz not null,
  verified_at timestamptz,
  retention_until timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint story_clusters_public_reference_key unique (public_reference),
  constraint story_clusters_country_check check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  constraint story_clusters_version_check check (current_version >= 1),
  constraint story_clusters_entities_check check (jsonb_typeof(entities) = 'object'),
  constraint story_clusters_verified_check check (
    status <> 'verified' or (verified_at is not null and evidence_strength in ('sufficient', 'strong'))
  ),
  constraint story_clusters_retention_check check (
    retention_until is null or retention_until >= created_at
  )
);

create index story_clusters_recent_eligible_idx
  on public.story_clusters (latest_event_at desc, category, country_code, state_region)
  where status = 'verified';
create index story_clusters_retention_idx on public.story_clusters (retention_until)
  where retention_until is not null;
create index story_clusters_embedding_hnsw_idx on public.story_clusters
  using hnsw (representative_embedding extensions.vector_cosine_ops)
  where representative_embedding is not null;

create table public.story_cluster_articles (
  cluster_id uuid not null references public.story_clusters(id) on delete cascade,
  article_id uuid not null references public.articles(id) on delete restrict,
  decision public.cluster_join_decision not null,
  decision_method text not null,
  decision_metadata jsonb not null default '{}'::jsonb,
  added_in_version integer not null,
  created_at timestamptz not null default statement_timestamp(),
  primary key (cluster_id, article_id),
  constraint story_cluster_articles_method_check check (char_length(btrim(decision_method)) between 1 and 100),
  constraint story_cluster_articles_metadata_check check (jsonb_typeof(decision_metadata) = 'object'),
  constraint story_cluster_articles_version_check check (added_in_version >= 1)
);

create index story_cluster_articles_article_idx on public.story_cluster_articles (article_id, decision);

create table public.cluster_summaries (
  id uuid primary key default gen_random_uuid(),
  cluster_id uuid not null references public.story_clusters(id) on delete cascade,
  cluster_version integer not null,
  language public.briefing_language not null,
  status public.summary_status not null default 'pending',
  headline text,
  summary text,
  why_it_matters text,
  attribution_markers jsonb not null default '[]'::jsonb,
  verification_result jsonb,
  prompt_version text,
  schema_version text,
  provider text,
  model text,
  model_metadata jsonb,
  verified_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint cluster_summaries_cluster_version_language_key unique (cluster_id, cluster_version, language),
  constraint cluster_summaries_version_check check (cluster_version >= 1),
  constraint cluster_summaries_json_check check (
    jsonb_typeof(attribution_markers) = 'array'
    and (verification_result is null or jsonb_typeof(verification_result) = 'object')
    and (model_metadata is null or jsonb_typeof(model_metadata) = 'object')
  ),
  constraint cluster_summaries_verified_content_check check (
    status <> 'verified'
    or (
      verified_at is not null
      and char_length(btrim(headline)) > 0
      and char_length(btrim(summary)) > 0
      and char_length(btrim(why_it_matters)) > 0
      and prompt_version is not null
      and schema_version is not null
      and provider is not null
      and model is not null
      and verification_result is not null
    )
  ),
  constraint cluster_summaries_english_canonical_check check (
    language <> 'en' or cluster_version >= 1
  )
);

create index cluster_summaries_verified_lookup_idx
  on public.cluster_summaries (language, cluster_id, cluster_version)
  where status = 'verified';

create table public.cluster_summary_articles (
  summary_id uuid not null references public.cluster_summaries(id) on delete cascade,
  article_id uuid not null references public.articles(id) on delete restrict,
  citation_order smallint not null,
  primary key (summary_id, article_id),
  constraint cluster_summary_articles_order_check check (citation_order >= 1),
  constraint cluster_summary_articles_summary_order_key unique (summary_id, citation_order)
);

create table public.deliveries (
  id uuid primary key default gen_random_uuid(),
  subscriber_id uuid not null references public.subscribers(id) on delete cascade,
  scheduled_for timestamptz not null,
  status public.delivery_status not null default 'pending',
  preference_version bigint not null,
  language public.briefing_language not null,
  theme public.briefing_theme not null,
  attempt_count smallint not null default 0,
  next_attempt_at timestamptz not null default statement_timestamp(),
  lease_token uuid,
  lease_owner uuid,
  lease_expires_at timestamptz,
  rendered_at timestamptz,
  send_started_at timestamptz,
  sent_at timestamptz,
  cancelled_at timestamptz,
  failure_code text,
  failure_class text,
  actual_story_count smallint,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint deliveries_subscriber_scheduled_for_key unique (subscriber_id, scheduled_for),
  constraint deliveries_preference_version_check check (preference_version >= 1),
  constraint deliveries_attempt_count_check check (attempt_count between 0 and 20),
  constraint deliveries_story_count_check check (actual_story_count is null or actual_story_count between 0 and 10),
  constraint deliveries_lease_check check (
    (lease_token is null and lease_owner is null and lease_expires_at is null)
    or (lease_token is not null and lease_owner is not null and lease_expires_at is not null)
  ),
  constraint deliveries_terminal_state_check check (
    (status = 'sent' and sent_at is not null and cancelled_at is null)
    or (status = 'cancelled' and cancelled_at is not null and sent_at is null)
    or (status not in ('sent', 'cancelled') and sent_at is null and cancelled_at is null)
  )
);

create index deliveries_worker_due_idx on public.deliveries (next_attempt_at, scheduled_for, id)
  where status in ('pending', 'retry-wait');
create index deliveries_subscriber_history_idx on public.deliveries (subscriber_id, scheduled_for desc);
create index deliveries_retention_idx on public.deliveries (created_at)
  where status in ('sent', 'failed', 'cancelled');

create table public.delivery_stories (
  delivery_id uuid not null references public.deliveries(id) on delete cascade,
  position smallint not null,
  cluster_id uuid references public.story_clusters(id) on delete set null,
  cluster_public_reference uuid not null,
  cluster_version integer not null,
  summary_id uuid references public.cluster_summaries(id) on delete set null,
  summary_language public.briefing_language not null,
  is_update boolean not null default false,
  primary key (delivery_id, position),
  constraint delivery_stories_delivery_cluster_version_key unique (
    delivery_id, cluster_public_reference, cluster_version
  ),
  constraint delivery_stories_position_check check (position between 1 and 10),
  constraint delivery_stories_version_check check (cluster_version >= 1)
);

create index delivery_stories_repeat_suppression_idx
  on public.delivery_stories (cluster_public_reference, cluster_version, delivery_id);

create table public.admin_audit_log (
  id bigint generated always as identity primary key,
  action text not null,
  target_type text,
  target_subscriber_id uuid references public.subscribers(id) on delete set null,
  request_id uuid,
  outcome public.audit_outcome not null,
  safe_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default statement_timestamp(),
  constraint admin_audit_log_action_check check (char_length(btrim(action)) between 1 and 100),
  constraint admin_audit_log_metadata_check check (jsonb_typeof(safe_metadata) = 'object')
);

create index admin_audit_log_created_idx on public.admin_audit_log (created_at desc);
create index admin_audit_log_target_idx on public.admin_audit_log (target_subscriber_id, created_at desc)
  where target_subscriber_id is not null;

create table public.alert_events (
  id uuid primary key default gen_random_uuid(),
  deduplication_key text not null,
  severity public.alert_severity not null,
  status public.alert_status not null default 'open',
  title text not null,
  safe_details jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default statement_timestamp(),
  last_seen_at timestamptz not null default statement_timestamp(),
  occurrence_count integer not null default 1,
  resolved_at timestamptz,
  constraint alert_events_deduplication_key_key unique (deduplication_key),
  constraint alert_events_count_check check (occurrence_count >= 1),
  constraint alert_events_details_check check (jsonb_typeof(safe_details) = 'object'),
  constraint alert_events_resolution_check check (
    (status = 'resolved' and resolved_at is not null)
    or (status <> 'resolved' and resolved_at is null)
  )
);

create index alert_events_open_idx on public.alert_events (severity, last_seen_at desc)
  where status <> 'resolved';

create table public.worker_heartbeats (
  worker_name text primary key,
  last_started_at timestamptz,
  last_completed_at timestamptz,
  last_failed_at timestamptz,
  last_error_code text,
  last_batch_size integer,
  updated_at timestamptz not null default statement_timestamp(),
  constraint worker_heartbeats_name_check check (char_length(btrim(worker_name)) between 1 and 100),
  constraint worker_heartbeats_batch_check check (last_batch_size is null or last_batch_size >= 0)
);

create trigger subscribers_set_updated_at
before update on public.subscribers
for each row execute function bulletin_private.set_updated_at();
create trigger subscriber_preferences_set_updated_at
before update on public.subscriber_preferences
for each row execute function bulletin_private.set_updated_at();
create trigger subscriber_schedules_set_updated_at
before update on public.subscriber_schedules
for each row execute function bulletin_private.set_updated_at();
create trigger sources_set_updated_at
before update on public.sources
for each row execute function bulletin_private.set_updated_at();
create trigger articles_set_updated_at
before update on public.articles
for each row execute function bulletin_private.set_updated_at();
create trigger story_clusters_set_updated_at
before update on public.story_clusters
for each row execute function bulletin_private.set_updated_at();
create trigger cluster_summaries_set_updated_at
before update on public.cluster_summaries
for each row execute function bulletin_private.set_updated_at();
create trigger deliveries_set_updated_at
before update on public.deliveries
for each row execute function bulletin_private.set_updated_at();

comment on column public.subscribers.email is
  'Lowercase, trimmed comparison form. Email is unique but never an access credential.';
comment on column public.articles.embedding is
  '768-dimensional shared article embedding; the Phase 7 provider must request exactly 768 dimensions.';
comment on column public.admin_audit_log.safe_metadata is
  'Operational IDs, versions, and reason codes only. Never store email, name, preferences, tokens, or private URLs.';
comment on table public.delivery_stories is
  'Stores a non-personal cluster reference snapshot so repeat suppression survives 30-day cluster cleanup.';
