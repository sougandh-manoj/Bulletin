-- Bulletin Phase 7: shared story-intelligence metadata and resumable work.
--
-- This migration extends the public-news tables frozen in Phase 2. It neither
-- creates a subscriber-facing table nor changes source activation. Provider
-- quota counters live in bulletin_private so they are not Data API resources.

alter table public.sources
  add column publisher_family_key text,
  add column publisher_family_metadata jsonb not null default '{}'::jsonb;

update public.sources
set publisher_family_key = case
  when publisher_name = 'NDTV.com' then 'ndtv'
  when publisher_name = 'News18 Malayalam' then 'news18'
  when publisher_name in ('Mongabay India', 'Mongabay Hindi') then 'mongabay-india'
  when publisher_name in ('Tech Xplore', 'Phys.org', 'Medical Xpress') then 'science-x'
  when publisher_name = 'Press Information Bureau' then 'pib'
  when publisher_name = 'Reserve Bank of India' then 'rbi'
  when publisher_name = 'Securities and Exchange Board of India' then 'sebi'
  when publisher_name = 'United Nations News' then 'un-news'
  when publisher_name = 'World Health Organization' then 'who'
  else regexp_replace(
    regexp_replace(lower(publisher_name), '[^a-z0-9]+', '-', 'g'),
    '(^-|-$)', '', 'g'
  )
end,
publisher_family_metadata = jsonb_build_object(
  'version', 'phase-7-v1',
  'basis', case
    when publisher_name in ('Tech Xplore', 'Phys.org', 'Medical Xpress') then 'reviewed-family'
    when publisher_name in ('NDTV.com', 'News18 Malayalam', 'Mongabay India', 'Mongabay Hindi') then 'reviewed-language-editions'
    else 'publisher-identity'
  end
);

alter table public.sources
  alter column publisher_family_key set default 'unreviewed',
  alter column publisher_family_key set not null,
  add constraint sources_publisher_family_key_check check (
    publisher_family_key ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  ),
  add constraint sources_publisher_family_metadata_check check (
    jsonb_typeof(publisher_family_metadata) = 'object'
  );

create index sources_publisher_family_idx
  on public.sources (publisher_family_key, reliability, is_aggregator, is_institutional);

alter table public.articles
  add column embedding_provider text,
  add column embedding_dimensions smallint,
  add column classification_version text,
  add column event_country_code text,
  add column event_state_region text,
  add column event_city text,
  add column event_type text,
  add column event_time timestamptz,
  add column key_action text,
  add column key_outcome text,
  add column important_numbers jsonb not null default '[]'::jsonb,
  add column sensitive_flags text[] not null default '{}',
  add column is_sensitive boolean not null default false,
  add column factual_depth smallint,
  add column event_fingerprint bytea,
  add column evidence_independence_key bytea,
  add column evidence_duplicate_of_article_id uuid references public.articles(id) on delete set null,
  add column evidence_duplicate_kind text,
  add column intelligence_metadata jsonb not null default '{}'::jsonb;

alter table public.articles
  add constraint articles_embedding_provenance_check check (
    (embedding is null and embedding_provider is null and embedding_dimensions is null)
    or (
      embedding is not null
      and char_length(btrim(embedding_provider)) between 1 and 80
      and char_length(btrim(embedding_model)) between 1 and 120
      and embedding_dimensions = 768
    )
  ),
  add constraint articles_classification_version_check check (
    classification_version is null
    or char_length(btrim(classification_version)) between 1 and 80
  ),
  add constraint articles_event_fields_check check (
    (event_country_code is null or event_country_code ~ '^[A-Z]{2}$')
    and (event_state_region is null or char_length(btrim(event_state_region)) between 1 and 120)
    and (event_city is null or char_length(btrim(event_city)) between 1 and 120)
    and
    (event_type is null or char_length(btrim(event_type)) between 1 and 100)
    and (key_action is null or char_length(btrim(key_action)) between 1 and 500)
    and (key_outcome is null or char_length(btrim(key_outcome)) between 1 and 500)
  ),
  add constraint articles_intelligence_json_check check (
    jsonb_typeof(important_numbers) = 'array'
    and jsonb_typeof(intelligence_metadata) = 'object'
  ),
  add constraint articles_sensitive_flags_check check (
    bulletin_private.text_array_is_normalized_unique(sensitive_flags)
  ),
  add constraint articles_factual_depth_check check (
    factual_depth is null or factual_depth between 0 and 3
  ),
  add constraint articles_event_fingerprint_check check (
    event_fingerprint is null or octet_length(event_fingerprint) = 32
  ),
  add constraint articles_evidence_key_check check (
    evidence_independence_key is null or octet_length(evidence_independence_key) = 32
  ),
  add constraint articles_evidence_duplicate_check check (
    (
      evidence_duplicate_of_article_id is null
      and evidence_duplicate_kind is null
    )
    or (
      evidence_duplicate_of_article_id is not null
      and evidence_duplicate_of_article_id is distinct from id
      and evidence_duplicate_kind in ('cross-source-exact', 'cross-source-near')
    )
  );

create index articles_event_fingerprint_idx
  on public.articles (event_fingerprint, published_at desc)
  where event_fingerprint is not null;
create index articles_evidence_duplicate_idx
  on public.articles (evidence_duplicate_of_article_id)
  where evidence_duplicate_of_article_id is not null;
create index articles_event_candidate_filter_idx
  on public.articles (event_type, event_time, event_country_code, event_state_region)
  where processing_status = 'processed';
create index articles_claimed_lease_expiry_idx
  on public.articles (lease_expires_at, published_at, id)
  where processing_status = 'claimed';

alter table public.story_clusters
  add column event_type text,
  add column event_time timestamptz,
  add column key_action text,
  add column key_outcome text,
  add column important_numbers jsonb not null default '[]'::jsonb,
  add column event_fingerprint bytea,
  add column evidence_independence_count smallint not null default 0,
  add column evidence_result jsonb not null default '{}'::jsonb,
  add column conflict_details jsonb not null default '[]'::jsonb,
  add column verification_version text,
  add column summary_due_at timestamptz;

alter table public.story_clusters
  add constraint story_clusters_event_fields_check check (
    (event_type is null or char_length(btrim(event_type)) between 1 and 100)
    and (key_action is null or char_length(btrim(key_action)) between 1 and 500)
    and (key_outcome is null or char_length(btrim(key_outcome)) between 1 and 500)
  ),
  add constraint story_clusters_intelligence_json_check check (
    jsonb_typeof(important_numbers) = 'array'
    and jsonb_typeof(evidence_result) = 'object'
    and jsonb_typeof(conflict_details) = 'array'
  ),
  add constraint story_clusters_event_fingerprint_check check (
    event_fingerprint is null or octet_length(event_fingerprint) = 32
  ),
  add constraint story_clusters_evidence_count_check check (
    evidence_independence_count >= 0
  ),
  add constraint story_clusters_verification_version_check check (
    verification_version is null
    or char_length(btrim(verification_version)) between 1 and 80
  );

create unique index story_clusters_event_fingerprint_key
  on public.story_clusters (event_fingerprint)
  where event_fingerprint is not null;
create index story_clusters_phase_7_candidates_idx
  on public.story_clusters (latest_event_at desc, event_type, category, country_code, state_region)
  where status in ('candidate', 'open', 'verified');

alter table public.cluster_summaries
  add column attempt_count smallint not null default 0,
  add column next_attempt_at timestamptz not null default statement_timestamp(),
  add column lease_token uuid,
  add column lease_owner uuid,
  add column lease_expires_at timestamptz,
  add column last_error_code text,
  add column source_references jsonb not null default '[]'::jsonb,
  add column content_hash bytea,
  add column verification_version text,
  add column repair_attempted boolean not null default false;

alter table public.cluster_summaries
  add constraint cluster_summaries_attempt_count_check check (
    attempt_count between 0 and 10
  ),
  add constraint cluster_summaries_lease_check check (
    (lease_token is null and lease_owner is null and lease_expires_at is null)
    or (lease_token is not null and lease_owner is not null and lease_expires_at is not null)
  ),
  add constraint cluster_summaries_source_references_check check (
    jsonb_typeof(source_references) = 'array'
  ),
  add constraint cluster_summaries_content_hash_check check (
    content_hash is null or octet_length(content_hash) = 32
  ),
  add constraint cluster_summaries_verification_version_check check (
    verification_version is null
    or char_length(btrim(verification_version)) between 1 and 80
  );

create index cluster_summaries_worker_due_idx
  on public.cluster_summaries (next_attempt_at, language, cluster_id, cluster_version)
  where status in ('pending', 'retry-wait');
create index cluster_summaries_generating_lease_expiry_idx
  on public.cluster_summaries (lease_expires_at, language, cluster_id, cluster_version)
  where status = 'generating';

create table bulletin_private.ai_provider_usage_windows (
  provider text not null,
  model text not null,
  task_kind text not null,
  window_kind text not null,
  window_started_at timestamptz not null,
  request_count integer not null default 0,
  estimated_input_units bigint not null default 0,
  expires_at timestamptz not null,
  updated_at timestamptz not null default statement_timestamp(),
  primary key (provider, model, task_kind, window_kind, window_started_at),
  constraint ai_provider_usage_provider_check check (
    char_length(btrim(provider)) between 1 and 80
    and char_length(btrim(model)) between 1 and 120
  ),
  constraint ai_provider_usage_task_check check (
    task_kind in ('embedding', 'classification', 'cluster-verification', 'summarization', 'localization', 'final-verification')
  ),
  constraint ai_provider_usage_window_check check (window_kind in ('minute', 'day')),
  constraint ai_provider_usage_count_check check (
    request_count >= 0 and estimated_input_units >= 0
  ),
  constraint ai_provider_usage_expiry_check check (expires_at > window_started_at)
);

create index ai_provider_usage_expiry_idx
  on bulletin_private.ai_provider_usage_windows (expires_at);

revoke all on bulletin_private.ai_provider_usage_windows from public, anon, authenticated;
grant select, insert, update, delete on bulletin_private.ai_provider_usage_windows to service_role;

-- Columns on the existing public tables inherit their forced RLS and service
-- role policy. Reassert table denial so later privilege drift cannot expose
-- article intelligence, prompt provenance, or evidence internals.
revoke all on public.sources, public.articles, public.story_clusters,
  public.story_cluster_articles, public.cluster_summaries,
  public.cluster_summary_articles from public, anon, authenticated;

comment on column public.sources.publisher_family_key is
  'Reviewed publisher-family identity used for evidence independence; exact publisher_name remains the displayed attribution.';
comment on column public.articles.evidence_independence_key is
  'One evidence unit per publisher family, or a shared key for detected cross-source syndication. Never derived from subscriber data.';
comment on column public.story_clusters.event_fingerprint is
  'Deterministic event identity from event type, time, place, principal entities, and important numeric claims.';
comment on table bulletin_private.ai_provider_usage_windows is
  'Non-personal persistent quota counters. Stores counts only, never prompts, article text, responses, credentials, or subscriber data.';
