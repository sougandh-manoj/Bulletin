-- Bulletin Phase 6: source-catalogue metadata and the reviewed initial feed set.
--
-- Catalogue activation is deliberately fail-closed. A technically valid feed is
-- not scheduled unless the usage review is approved for Bulletin's current
-- metadata-and-link ingestion scope. Restricted, rejected, pending, or broken
-- feeds remain visible for governance and can only be activated by a later
-- reviewed migration.

create or replace function bulletin_private.host_array_is_safe(hosts text[])
returns boolean
language sql
immutable
strict
set search_path = ''
as $$
  select cardinality(hosts) > 0
    and cardinality(hosts) = (select count(distinct host) from unnest(hosts) as item(host))
    and not exists (
      select 1
      from unnest(hosts) as allowed_host(host)
      where host = ''
        or host <> lower(btrim(host))
        or host !~ '^[a-z0-9.-]+$'
    );
$$;

alter table public.sources
  add column catalogue_key text,
  add column publisher_home_url text,
  add column feed_format text,
  add column allowed_hosts text[] not null default '{}',
  add column usage_review_url text,
  add column usage_reviewed_at timestamptz,
  add column technical_status text not null default 'pending',
  add column verification_checked_at timestamptz,
  add column verification_http_status integer,
  add column verification_notes text,
  add column disabled_reason text,
  add column last_http_status integer,
  add column last_response_bytes integer,
  add column last_effective_url text,
  add column last_error_code text,
  add column last_error_at timestamptz,
  add column parser_version text,
  add column retry_after_at timestamptz,
  add column last_article_count integer not null default 0,
  add column last_duplicate_count integer not null default 0;

alter table public.sources
  add constraint sources_catalogue_key_key unique (catalogue_key),
  add constraint sources_catalogue_key_check check (
    catalogue_key is null or catalogue_key ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  ),
  add constraint sources_https_urls_check check (
    feed_url ~ '^https://'
    and (publisher_home_url is null or publisher_home_url ~ '^https://')
    and (usage_review_url is null or usage_review_url ~ '^https://')
  ),
  add constraint sources_feed_format_check check (
    feed_format is null or feed_format in ('rss-1.0', 'rss-2.0', 'atom')
  ),
  add constraint sources_allowed_hosts_check check (
    catalogue_key is null or bulletin_private.host_array_is_safe(allowed_hosts)
  ),
  add constraint sources_technical_status_check check (
    technical_status in ('pending', 'verified', 'blocked', 'broken')
  ),
  add constraint sources_http_status_check check (
    (verification_http_status is null or verification_http_status between 100 and 599)
    and (last_http_status is null or last_http_status between 100 and 599)
  ),
  add constraint sources_ingestion_counts_check check (
    (last_response_bytes is null or last_response_bytes >= 0)
    and last_article_count >= 0
    and last_duplicate_count >= 0
  ),
  add constraint sources_phase_6_activation_check check (
    not is_active or catalogue_key is null or technical_status = 'verified'
  );

create index sources_catalogue_governance_idx
  on public.sources (terms_status, technical_status, is_active, catalogue_key);

alter table public.articles
  add column original_url text,
  add column feed_entry_id text,
  add column feed_updated_at timestamptz,
  add column timestamp_source text,
  add column language_source text,
  add column geography_source text,
  add column duplicate_of_article_id uuid references public.articles(id) on delete set null,
  add column duplicate_kind text,
  add column normalization_version text not null default 'phase-6-v1';

alter table public.articles
  add constraint articles_duplicate_kind_check check (
    duplicate_kind is null or duplicate_kind in ('same-source-title', 'same-source-near-title')
  ),
  add constraint articles_duplicate_state_check check (
    (duplicate_of_article_id is null and duplicate_kind is null)
    or (
      duplicate_of_article_id is not null
      and duplicate_kind is not null
      and processing_status = 'quarantined'
    )
  ),
  add constraint articles_duplicate_not_self_check check (duplicate_of_article_id is distinct from id),
  add constraint articles_normalization_version_check check (
    char_length(btrim(normalization_version)) between 1 and 40
  );

create index articles_same_source_dedupe_idx
  on public.articles (source_id, normalized_title_hash, published_at desc);
create index articles_duplicate_of_idx
  on public.articles (duplicate_of_article_id)
  where duplicate_of_article_id is not null;

with catalogue (
  id, catalogue_key, publisher_name, feed_name, feed_url, publisher_domain,
  publisher_home_url, category_scope, language, country_code, state_region,
  expected_update_interval, reliability, role, is_institutional, terms_status,
  terms_notes, is_active, feed_format, allowed_hosts, usage_review_url,
  technical_status, verification_http_status, verification_notes, disabled_reason
) as (
  values
    -- The Indian Express: official and technically healthy, but its general
    -- terms prohibit systematic database storage. Preserve as restricted.
    ('60000000-0000-4000-8000-000000000001'::uuid, 'indian-express-india', 'The Indian Express', 'India', 'https://indianexpress.com/section/india/feed/', 'indianexpress.com', 'https://indianexpress.com/', array['india','politics']::public.news_category[], 'en'::public.briefing_language, 'IN', null, interval '15 minutes', 'tier-1'::public.source_reliability, 'primary'::public.source_role, false, 'restricted'::public.terms_review_status, 'Official RSS is personal/non-commercial; general terms prohibit systematic database storage. Keep disabled pending written permission.', false, 'rss-2.0', array['indianexpress.com','www.indianexpress.com'], 'https://indianexpress.com/rss/', 'verified', 200, 'Valid RSS 2.0; 200 items at final verification.', 'Usage terms conflict with Bulletin storage.'),
    ('60000000-0000-4000-8000-000000000002', 'indian-express-world', 'The Indian Express', 'World', 'https://indianexpress.com/section/world/feed/', 'indianexpress.com', 'https://indianexpress.com/', array['world']::public.news_category[], 'en', null, null, interval '15 minutes', 'tier-1', 'primary', false, 'restricted', 'Same publisher-level usage review as indian-express-india.', false, 'rss-2.0', array['indianexpress.com','www.indianexpress.com'], 'https://indianexpress.com/rss/', 'verified', 200, 'Valid RSS 2.0; 200 items.', 'Usage terms conflict with Bulletin storage.'),
    ('60000000-0000-4000-8000-000000000003', 'indian-express-business', 'The Indian Express', 'Business', 'https://indianexpress.com/section/business/feed/', 'indianexpress.com', 'https://indianexpress.com/', array['business-economy']::public.news_category[], 'en', 'IN', null, interval '15 minutes', 'tier-1', 'primary', false, 'restricted', 'Same publisher-level usage review as indian-express-india.', false, 'rss-2.0', array['indianexpress.com','www.indianexpress.com'], 'https://indianexpress.com/rss/', 'verified', 200, 'Valid RSS 2.0; 200 items.', 'Usage terms conflict with Bulletin storage.'),
    ('60000000-0000-4000-8000-000000000004', 'indian-express-technology', 'The Indian Express', 'Technology', 'https://indianexpress.com/section/technology/feed/', 'indianexpress.com', 'https://indianexpress.com/', array['technology-ai']::public.news_category[], 'en', 'IN', null, interval '20 minutes', 'tier-1', 'primary', false, 'restricted', 'Same publisher-level usage review as indian-express-india.', false, 'rss-2.0', array['indianexpress.com','www.indianexpress.com'], 'https://indianexpress.com/rss/', 'verified', 200, 'Valid RSS 2.0; 200 items.', 'Usage terms conflict with Bulletin storage.'),
    ('60000000-0000-4000-8000-000000000005', 'indian-express-science', 'The Indian Express', 'Science', 'https://indianexpress.com/section/technology/science/feed/', 'indianexpress.com', 'https://indianexpress.com/', array['science']::public.news_category[], 'en', 'IN', null, interval '30 minutes', 'tier-1', 'primary', false, 'restricted', 'Same publisher-level usage review as indian-express-india.', false, 'rss-2.0', array['indianexpress.com','www.indianexpress.com'], 'https://indianexpress.com/rss/', 'verified', 200, 'Valid RSS 2.0; 200 items.', 'Usage terms conflict with Bulletin storage.'),
    ('60000000-0000-4000-8000-000000000006', 'indian-express-health', 'The Indian Express', 'Health and Wellness', 'https://indianexpress.com/section/health-wellness/feed/', 'indianexpress.com', 'https://indianexpress.com/', array['health']::public.news_category[], 'en', 'IN', null, interval '30 minutes', 'tier-1', 'primary', false, 'restricted', 'Same publisher-level usage review as indian-express-india.', false, 'rss-2.0', array['indianexpress.com','www.indianexpress.com'], 'https://indianexpress.com/rss/', 'verified', 200, 'Valid RSS 2.0; 200 items.', 'Usage terms conflict with Bulletin storage.'),
    ('60000000-0000-4000-8000-000000000007', 'indian-express-education', 'The Indian Express', 'Education', 'https://indianexpress.com/section/education/feed/', 'indianexpress.com', 'https://indianexpress.com/', array['education-careers']::public.news_category[], 'en', 'IN', null, interval '30 minutes', 'tier-1', 'primary', false, 'restricted', 'Same publisher-level usage review as indian-express-india.', false, 'rss-2.0', array['indianexpress.com','www.indianexpress.com'], 'https://indianexpress.com/rss/', 'verified', 200, 'Valid RSS 2.0; 200 items.', 'Usage terms conflict with Bulletin storage.'),
    ('60000000-0000-4000-8000-000000000008', 'indian-express-sports', 'The Indian Express', 'Sports', 'https://indianexpress.com/section/sports/feed/', 'indianexpress.com', 'https://indianexpress.com/', array['sports']::public.news_category[], 'en', 'IN', null, interval '15 minutes', 'tier-1', 'primary', false, 'restricted', 'Same publisher-level usage review as indian-express-india.', false, 'rss-2.0', array['indianexpress.com','www.indianexpress.com'], 'https://indianexpress.com/rss/', 'verified', 200, 'Valid RSS 2.0; 200 items.', 'Usage terms conflict with Bulletin storage.'),
    ('60000000-0000-4000-8000-000000000009', 'indian-express-north-east', 'The Indian Express', 'North East India', 'https://indianexpress.com/section/north-east-india/feed/', 'indianexpress.com', 'https://indianexpress.com/', array['regional-local','india']::public.news_category[], 'en', 'IN', 'North East India', interval '20 minutes', 'tier-1', 'primary', false, 'restricted', 'Same publisher-level usage review as indian-express-india.', false, 'rss-2.0', array['indianexpress.com','www.indianexpress.com'], 'https://indianexpress.com/rss/', 'verified', 200, 'Valid RSS 2.0; 200 items.', 'Usage terms conflict with Bulletin storage.'),
    ('60000000-0000-4000-8000-000000000010', 'indian-express-delhi', 'The Indian Express', 'Delhi', 'https://indianexpress.com/section/cities/delhi/feed/', 'indianexpress.com', 'https://indianexpress.com/', array['regional-local']::public.news_category[], 'en', 'IN', 'Delhi', interval '20 minutes', 'tier-1', 'primary', false, 'restricted', 'Same publisher-level usage review as indian-express-india.', false, 'rss-2.0', array['indianexpress.com','www.indianexpress.com'], 'https://indianexpress.com/rss/', 'verified', 200, 'Valid RSS 2.0; 200 items.', 'Usage terms conflict with Bulletin storage.'),
    ('60000000-0000-4000-8000-000000000011', 'indian-express-chandigarh', 'The Indian Express', 'Chandigarh', 'https://indianexpress.com/section/cities/chandigarh/feed/', 'indianexpress.com', 'https://indianexpress.com/', array['regional-local']::public.news_category[], 'en', 'IN', 'Chandigarh', interval '20 minutes', 'tier-1', 'primary', false, 'restricted', 'Same publisher-level usage review as indian-express-india.', false, 'rss-2.0', array['indianexpress.com','www.indianexpress.com'], 'https://indianexpress.com/rss/', 'verified', 200, 'Valid RSS 2.0; 200 items.', 'Usage terms conflict with Bulletin storage.'),
    ('60000000-0000-4000-8000-000000000012', 'indian-express-jammu', 'The Indian Express', 'Jammu', 'https://indianexpress.com/section/cities/jammu/feed/', 'indianexpress.com', 'https://indianexpress.com/', array['regional-local']::public.news_category[], 'en', 'IN', 'Jammu and Kashmir', interval '30 minutes', 'tier-1', 'primary', false, 'restricted', 'Same publisher-level usage review as indian-express-india.', false, 'rss-2.0', array['indianexpress.com','www.indianexpress.com'], 'https://indianexpress.com/rss/', 'verified', 200, 'Valid RSS 2.0; 200 items.', 'Usage terms conflict with Bulletin storage.'),
    ('60000000-0000-4000-8000-000000000013', 'indian-express-srinagar', 'The Indian Express', 'Srinagar', 'https://indianexpress.com/section/cities/srinagar/feed/', 'indianexpress.com', 'https://indianexpress.com/', array['regional-local']::public.news_category[], 'en', 'IN', 'Jammu and Kashmir', interval '30 minutes', 'tier-1', 'primary', false, 'restricted', 'Same publisher-level usage review as indian-express-india.', false, 'rss-2.0', array['indianexpress.com','www.indianexpress.com'], 'https://indianexpress.com/rss/', 'verified', 200, 'Valid RSS 2.0; 200 items.', 'Usage terms conflict with Bulletin storage.'),
    ('60000000-0000-4000-8000-000000000014', 'indian-express-goa', 'The Indian Express', 'Goa', 'https://indianexpress.com/section/cities/goa/feed/', 'indianexpress.com', 'https://indianexpress.com/', array['regional-local']::public.news_category[], 'en', 'IN', 'Goa', interval '30 minutes', 'tier-1', 'primary', false, 'restricted', 'Same publisher-level usage review as indian-express-india.', false, 'rss-2.0', array['indianexpress.com','www.indianexpress.com'], 'https://indianexpress.com/rss/', 'verified', 200, 'Valid RSS 2.0; 200 items.', 'Usage terms conflict with Bulletin storage.'),
    ('60000000-0000-4000-8000-000000000015', 'indian-express-kerala', 'The Indian Express', 'Kerala', 'https://indianexpress.com/section/india/kerala/feed/', 'indianexpress.com', 'https://indianexpress.com/', array['regional-local']::public.news_category[], 'en', 'IN', 'Kerala', interval '30 minutes', 'tier-1', 'primary', false, 'restricted', 'Same publisher-level usage review as indian-express-india.', false, 'rss-2.0', array['indianexpress.com','www.indianexpress.com'], 'https://indianexpress.com/rss/', 'verified', 200, 'Valid RSS 2.0; 200 items.', 'Usage terms conflict with Bulletin storage.'),
    ('60000000-0000-4000-8000-000000000016', 'indian-express-bengaluru', 'The Indian Express', 'Bengaluru', 'https://indianexpress.com/section/cities/bangalore/feed/', 'indianexpress.com', 'https://indianexpress.com/', array['regional-local']::public.news_category[], 'en', 'IN', 'Karnataka', interval '20 minutes', 'tier-1', 'primary', false, 'restricted', 'Same publisher-level usage review as indian-express-india.', false, 'rss-2.0', array['indianexpress.com','www.indianexpress.com'], 'https://indianexpress.com/rss/', 'verified', 200, 'Valid RSS 2.0; 200 items.', 'Usage terms conflict with Bulletin storage.'),
    ('60000000-0000-4000-8000-000000000017', 'indian-express-chennai', 'The Indian Express', 'Chennai', 'https://indianexpress.com/section/cities/chennai/feed/', 'indianexpress.com', 'https://indianexpress.com/', array['regional-local']::public.news_category[], 'en', 'IN', 'Tamil Nadu', interval '20 minutes', 'tier-1', 'primary', false, 'restricted', 'Same publisher-level usage review as indian-express-india.', false, 'rss-2.0', array['indianexpress.com','www.indianexpress.com'], 'https://indianexpress.com/rss/', 'verified', 200, 'Valid RSS 2.0; 200 items.', 'Usage terms conflict with Bulletin storage.'),
    ('60000000-0000-4000-8000-000000000018', 'indian-express-hyderabad', 'The Indian Express', 'Hyderabad', 'https://indianexpress.com/section/cities/hyderabad/feed/', 'indianexpress.com', 'https://indianexpress.com/', array['regional-local']::public.news_category[], 'en', 'IN', 'Telangana', interval '20 minutes', 'tier-1', 'primary', false, 'restricted', 'Same publisher-level usage review as indian-express-india.', false, 'rss-2.0', array['indianexpress.com','www.indianexpress.com'], 'https://indianexpress.com/rss/', 'verified', 200, 'Valid RSS 2.0; 200 items.', 'Usage terms conflict with Bulletin storage.'),
    ('60000000-0000-4000-8000-000000000019', 'indian-express-bhubaneswar', 'The Indian Express', 'Bhubaneswar', 'https://indianexpress.com/section/cities/bhubaneswar/feed/', 'indianexpress.com', 'https://indianexpress.com/', array['regional-local']::public.news_category[], 'en', 'IN', 'Odisha', interval '30 minutes', 'tier-1', 'primary', false, 'restricted', 'Same publisher-level usage review as indian-express-india.', false, 'rss-2.0', array['indianexpress.com','www.indianexpress.com'], 'https://indianexpress.com/rss/', 'verified', 200, 'Valid RSS 2.0; 200 items.', 'Usage terms conflict with Bulletin storage.'),
    ('60000000-0000-4000-8000-000000000020', 'indian-express-kolkata', 'The Indian Express', 'Kolkata', 'https://indianexpress.com/section/cities/kolkata/feed/', 'indianexpress.com', 'https://indianexpress.com/', array['regional-local']::public.news_category[], 'en', 'IN', 'West Bengal', interval '20 minutes', 'tier-1', 'primary', false, 'restricted', 'Same publisher-level usage review as indian-express-india.', false, 'rss-2.0', array['indianexpress.com','www.indianexpress.com'], 'https://indianexpress.com/rss/', 'verified', 200, 'Valid RSS 2.0; 200 items.', 'Usage terms conflict with Bulletin storage.'),
    ('60000000-0000-4000-8000-000000000021', 'indian-express-lucknow', 'The Indian Express', 'Lucknow', 'https://indianexpress.com/section/cities/lucknow/feed/', 'indianexpress.com', 'https://indianexpress.com/', array['regional-local']::public.news_category[], 'en', 'IN', 'Uttar Pradesh', interval '20 minutes', 'tier-1', 'primary', false, 'restricted', 'Same publisher-level usage review as indian-express-india.', false, 'rss-2.0', array['indianexpress.com','www.indianexpress.com'], 'https://indianexpress.com/rss/', 'verified', 200, 'Valid RSS 2.0; 200 items.', 'Usage terms conflict with Bulletin storage.'),
    ('60000000-0000-4000-8000-000000000022', 'indian-express-jaipur', 'The Indian Express', 'Jaipur', 'https://indianexpress.com/section/cities/jaipur/feed/', 'indianexpress.com', 'https://indianexpress.com/', array['regional-local']::public.news_category[], 'en', 'IN', 'Rajasthan', interval '30 minutes', 'tier-1', 'primary', false, 'restricted', 'Same publisher-level usage review as indian-express-india.', false, 'rss-2.0', array['indianexpress.com','www.indianexpress.com'], 'https://indianexpress.com/rss/', 'verified', 200, 'Valid RSS 2.0; 200 items.', 'Usage terms conflict with Bulletin storage.'),
    ('60000000-0000-4000-8000-000000000023', 'indian-express-bhopal', 'The Indian Express', 'Bhopal', 'https://indianexpress.com/section/cities/bhopal/feed/', 'indianexpress.com', 'https://indianexpress.com/', array['regional-local']::public.news_category[], 'en', 'IN', 'Madhya Pradesh', interval '30 minutes', 'tier-1', 'primary', false, 'restricted', 'Same publisher-level usage review as indian-express-india.', false, 'rss-2.0', array['indianexpress.com','www.indianexpress.com'], 'https://indianexpress.com/rss/', 'verified', 200, 'Valid RSS 2.0; 200 items.', 'Usage terms conflict with Bulletin storage.'),
    ('60000000-0000-4000-8000-000000000024', 'indian-express-patna', 'The Indian Express', 'Patna', 'https://indianexpress.com/section/cities/patna/feed/', 'indianexpress.com', 'https://indianexpress.com/', array['regional-local']::public.news_category[], 'en', 'IN', 'Bihar', interval '30 minutes', 'tier-1', 'primary', false, 'restricted', 'Same publisher-level usage review as indian-express-india.', false, 'rss-2.0', array['indianexpress.com','www.indianexpress.com'], 'https://indianexpress.com/rss/', 'verified', 200, 'Valid RSS 2.0; 200 items.', 'Usage terms conflict with Bulletin storage.'),
    ('60000000-0000-4000-8000-000000000025', 'indian-express-mumbai', 'The Indian Express', 'Mumbai', 'https://indianexpress.com/section/cities/mumbai/feed/', 'indianexpress.com', 'https://indianexpress.com/', array['regional-local']::public.news_category[], 'en', 'IN', 'Maharashtra', interval '20 minutes', 'tier-1', 'primary', false, 'restricted', 'Same publisher-level usage review as indian-express-india.', false, 'rss-2.0', array['indianexpress.com','www.indianexpress.com'], 'https://indianexpress.com/rss/', 'verified', 200, 'Valid RSS 2.0; 200 items.', 'Usage terms conflict with Bulletin storage.'),
    ('60000000-0000-4000-8000-000000000026', 'indian-express-ahmedabad', 'The Indian Express', 'Ahmedabad', 'https://indianexpress.com/section/cities/ahmedabad/feed/', 'indianexpress.com', 'https://indianexpress.com/', array['regional-local']::public.news_category[], 'en', 'IN', 'Gujarat', interval '30 minutes', 'tier-1', 'primary', false, 'restricted', 'Same publisher-level usage review as indian-express-india.', false, 'rss-2.0', array['indianexpress.com','www.indianexpress.com'], 'https://indianexpress.com/rss/', 'verified', 200, 'Valid RSS 2.0; 200 items.', 'Usage terms conflict with Bulletin storage.'),
    ('60000000-0000-4000-8000-000000000027', 'indian-express-shimla', 'The Indian Express', 'Shimla', 'https://indianexpress.com/section/cities/shimla/feed/', 'indianexpress.com', 'https://indianexpress.com/', array['regional-local']::public.news_category[], 'en', 'IN', 'Himachal Pradesh', interval '30 minutes', 'tier-1', 'primary', false, 'restricted', 'Same publisher-level usage review as indian-express-india.', false, 'rss-2.0', array['indianexpress.com','www.indianexpress.com'], 'https://indianexpress.com/rss/', 'verified', 200, 'Valid RSS 2.0; 200 items.', 'Usage terms conflict with Bulletin storage.'),

    -- Live Hindustan / HT: the current shared terms expressly prohibit bots,
    -- crawlers, automated access, caching, and archiving. Keep rejected.
    ('60000000-0000-4000-8000-000000000028', 'live-hindustan-national', 'Live Hindustan', 'National', 'https://api.livehindustan.com/feeds/rss/national/rssfeed.xml', 'livehindustan.com', 'https://www.livehindustan.com/', array['india','politics']::public.news_category[], 'hi', 'IN', null, interval '15 minutes', 'tier-2', 'primary', false, 'rejected', 'HTDSL terms covering Live Hindustan prohibit automated access, caching, archiving, and indexing without a written licence.', false, 'rss-2.0', array['api.livehindustan.com'], 'https://www.hindustantimes.com/termsofuse', 'verified', 200, 'Valid RSS 2.0 served as text/plain; 50 items.', 'Publisher terms prohibit automated ingestion.'),
    ('60000000-0000-4000-8000-000000000029', 'live-hindustan-world', 'Live Hindustan', 'International', 'https://api.livehindustan.com/feeds/rss/international/rssfeed.xml', 'livehindustan.com', 'https://www.livehindustan.com/', array['world']::public.news_category[], 'hi', null, null, interval '20 minutes', 'tier-2', 'primary', false, 'rejected', 'Same publisher-level usage review as live-hindustan-national.', false, 'rss-2.0', array['api.livehindustan.com'], 'https://www.hindustantimes.com/termsofuse', 'verified', 200, 'Valid RSS 2.0 served as text/plain; 50 items.', 'Publisher terms prohibit automated ingestion.'),
    ('60000000-0000-4000-8000-000000000030', 'live-hindustan-business', 'Live Hindustan', 'Business', 'https://api.livehindustan.com/feeds/rss/business/rssfeed.xml', 'livehindustan.com', 'https://www.livehindustan.com/', array['business-economy']::public.news_category[], 'hi', 'IN', null, interval '20 minutes', 'tier-2', 'primary', false, 'rejected', 'Same publisher-level usage review as live-hindustan-national.', false, 'rss-2.0', array['api.livehindustan.com'], 'https://www.hindustantimes.com/termsofuse', 'verified', 200, 'Valid RSS 2.0 served as text/plain; 50 items.', 'Publisher terms prohibit automated ingestion.'),
    ('60000000-0000-4000-8000-000000000031', 'live-hindustan-career', 'Live Hindustan', 'Career', 'https://api.livehindustan.com/feeds/rss/career/rssfeed.xml', 'livehindustan.com', 'https://www.livehindustan.com/', array['education-careers']::public.news_category[], 'hi', 'IN', null, interval '30 minutes', 'tier-2', 'primary', false, 'rejected', 'Same publisher-level usage review as live-hindustan-national.', false, 'rss-2.0', array['api.livehindustan.com'], 'https://www.hindustantimes.com/termsofuse', 'verified', 200, 'Valid RSS 2.0 served as text/plain; 50 items.', 'Publisher terms prohibit automated ingestion.'),
    ('60000000-0000-4000-8000-000000000032', 'live-hindustan-uttar-pradesh', 'Live Hindustan', 'Uttar Pradesh', 'https://api.livehindustan.com/feeds/rss/uttar-pradesh/rssfeed.xml', 'livehindustan.com', 'https://www.livehindustan.com/', array['regional-local']::public.news_category[], 'hi', 'IN', 'Uttar Pradesh', interval '20 minutes', 'tier-2', 'primary', false, 'rejected', 'Same publisher-level usage review as live-hindustan-national.', false, 'rss-2.0', array['api.livehindustan.com'], 'https://www.hindustantimes.com/termsofuse', 'verified', 200, 'Valid RSS 2.0 served as text/plain; 50 items.', 'Publisher terms prohibit automated ingestion.'),
    ('60000000-0000-4000-8000-000000000033', 'live-hindustan-bihar', 'Live Hindustan', 'Bihar', 'https://api.livehindustan.com/feeds/rss/bihar/rssfeed.xml', 'livehindustan.com', 'https://www.livehindustan.com/', array['regional-local']::public.news_category[], 'hi', 'IN', 'Bihar', interval '20 minutes', 'tier-2', 'primary', false, 'rejected', 'Same publisher-level usage review as live-hindustan-national.', false, 'rss-2.0', array['api.livehindustan.com'], 'https://www.hindustantimes.com/termsofuse', 'verified', 200, 'Valid RSS 2.0 served as text/plain; 50 items.', 'Publisher terms prohibit automated ingestion.'),
    ('60000000-0000-4000-8000-000000000034', 'live-hindustan-jharkhand', 'Live Hindustan', 'Jharkhand', 'https://api.livehindustan.com/feeds/rss/jharkhand/rssfeed.xml', 'livehindustan.com', 'https://www.livehindustan.com/', array['regional-local']::public.news_category[], 'hi', 'IN', 'Jharkhand', interval '20 minutes', 'tier-2', 'primary', false, 'rejected', 'Same publisher-level usage review as live-hindustan-national.', false, 'rss-2.0', array['api.livehindustan.com'], 'https://www.hindustantimes.com/termsofuse', 'verified', 200, 'Valid RSS 2.0 served as text/plain; 50 items.', 'Publisher terms prohibit automated ingestion.'),
    ('60000000-0000-4000-8000-000000000035', 'live-hindustan-uttarakhand', 'Live Hindustan', 'Uttarakhand', 'https://api.livehindustan.com/feeds/rss/uttarakhand/rssfeed.xml', 'livehindustan.com', 'https://www.livehindustan.com/', array['regional-local']::public.news_category[], 'hi', 'IN', 'Uttarakhand', interval '20 minutes', 'tier-2', 'primary', false, 'rejected', 'Same publisher-level usage review as live-hindustan-national.', false, 'rss-2.0', array['api.livehindustan.com'], 'https://www.hindustantimes.com/termsofuse', 'verified', 200, 'Valid RSS 2.0 served as text/plain; 50 items.', 'Publisher terms prohibit automated ingestion.'),
    ('60000000-0000-4000-8000-000000000036', 'live-hindustan-haryana', 'Live Hindustan', 'Haryana', 'https://api.livehindustan.com/feeds/rss/haryana/rssfeed.xml', 'livehindustan.com', 'https://www.livehindustan.com/', array['regional-local']::public.news_category[], 'hi', 'IN', 'Haryana', interval '30 minutes', 'tier-2', 'primary', false, 'rejected', 'Same publisher-level usage review as live-hindustan-national.', false, 'rss-2.0', array['api.livehindustan.com'], 'https://www.hindustantimes.com/termsofuse', 'verified', 200, 'Valid RSS 2.0 served as text/plain; 50 items.', 'Publisher terms prohibit automated ingestion.'),
    ('60000000-0000-4000-8000-000000000037', 'live-hindustan-rajasthan', 'Live Hindustan', 'Rajasthan', 'https://api.livehindustan.com/feeds/rss/rajasthan/rssfeed.xml', 'livehindustan.com', 'https://www.livehindustan.com/', array['regional-local']::public.news_category[], 'hi', 'IN', 'Rajasthan', interval '30 minutes', 'tier-2', 'primary', false, 'rejected', 'Same publisher-level usage review as live-hindustan-national.', false, 'rss-2.0', array['api.livehindustan.com'], 'https://www.hindustantimes.com/termsofuse', 'verified', 200, 'Valid RSS 2.0 served as text/plain; 50 items.', 'Publisher terms prohibit automated ingestion.'),
    ('60000000-0000-4000-8000-000000000038', 'live-hindustan-madhya-pradesh', 'Live Hindustan', 'Madhya Pradesh', 'https://api.livehindustan.com/feeds/rss/madhya-pradesh/rssfeed.xml', 'livehindustan.com', 'https://www.livehindustan.com/', array['regional-local']::public.news_category[], 'hi', 'IN', 'Madhya Pradesh', interval '30 minutes', 'tier-2', 'primary', false, 'rejected', 'Same publisher-level usage review as live-hindustan-national.', false, 'rss-2.0', array['api.livehindustan.com'], 'https://www.hindustantimes.com/termsofuse', 'verified', 200, 'Valid RSS 2.0 served as text/plain; 50 items.', 'Publisher terms prohibit automated ingestion.'),
    ('60000000-0000-4000-8000-000000000039', 'live-hindustan-chhattisgarh', 'Live Hindustan', 'Chhattisgarh', 'https://api.livehindustan.com/feeds/rss/chhattisgarh/rssfeed.xml', 'livehindustan.com', 'https://www.livehindustan.com/', array['regional-local']::public.news_category[], 'hi', 'IN', 'Chhattisgarh', interval '30 minutes', 'tier-2', 'primary', false, 'rejected', 'Same publisher-level usage review as live-hindustan-national.', false, 'rss-2.0', array['api.livehindustan.com'], 'https://www.hindustantimes.com/termsofuse', 'verified', 200, 'Valid RSS 2.0 served as text/plain; 50 items.', 'Publisher terms prohibit automated ingestion.'),

    -- Malayalam: News18 publishes these exact feed endpoints on its official
    -- RSS page. Only metadata/excerpts and direct publisher links are retained.
    ('60000000-0000-4000-8000-000000000040', 'news18-malayalam-kerala', 'News18 Malayalam', 'Kerala', 'https://malayalam.news18.com/commonfeeds/v1/mal/rss/kerala.xml', 'malayalam.news18.com', 'https://malayalam.news18.com/', array['regional-local']::public.news_category[], 'ml', 'IN', 'Kerala', interval '15 minutes', 'tier-2', 'primary', false, 'approved', 'Official RSS endpoint. Approved for current metadata/excerpt/link ingestion; re-review before external or commercial launch.', true, 'rss-2.0', array['malayalam.news18.com'], 'https://malayalam.news18.com/rss/', 'verified', 200, 'Valid RSS 2.0; 200 items.', null),
    ('60000000-0000-4000-8000-000000000041', 'news18-malayalam-india', 'News18 Malayalam', 'India', 'https://malayalam.news18.com/commonfeeds/v1/mal/rss/india.xml', 'malayalam.news18.com', 'https://malayalam.news18.com/', array['india']::public.news_category[], 'ml', 'IN', null, interval '20 minutes', 'tier-2', 'primary', false, 'approved', 'Same publisher-level usage review as news18-malayalam-kerala.', true, 'rss-2.0', array['malayalam.news18.com'], 'https://malayalam.news18.com/rss/', 'verified', 200, 'Valid RSS 2.0; 200 items.', null),
    ('60000000-0000-4000-8000-000000000042', 'news18-malayalam-world', 'News18 Malayalam', 'World', 'https://malayalam.news18.com/commonfeeds/v1/mal/rss/world.xml', 'malayalam.news18.com', 'https://malayalam.news18.com/', array['world']::public.news_category[], 'ml', null, null, interval '20 minutes', 'tier-2', 'primary', false, 'approved', 'Same publisher-level usage review as news18-malayalam-kerala.', true, 'rss-2.0', array['malayalam.news18.com'], 'https://malayalam.news18.com/rss/', 'verified', 200, 'Valid RSS 2.0; 200 items.', null),
    ('60000000-0000-4000-8000-000000000043', 'news18-malayalam-money', 'News18 Malayalam', 'Money', 'https://malayalam.news18.com/commonfeeds/v1/mal/rss/money.xml', 'malayalam.news18.com', 'https://malayalam.news18.com/', array['business-economy','markets-personal-finance']::public.news_category[], 'ml', 'IN', null, interval '30 minutes', 'tier-2', 'primary', false, 'approved', 'Same publisher-level usage review as news18-malayalam-kerala.', true, 'rss-2.0', array['malayalam.news18.com'], 'https://malayalam.news18.com/rss/', 'verified', 200, 'Valid RSS 2.0; 200 items.', null),
    ('60000000-0000-4000-8000-000000000044', 'news18-malayalam-sports', 'News18 Malayalam', 'Sports', 'https://malayalam.news18.com/commonfeeds/v1/mal/rss/sports.xml', 'malayalam.news18.com', 'https://malayalam.news18.com/', array['sports']::public.news_category[], 'ml', 'IN', null, interval '20 minutes', 'tier-2', 'primary', false, 'approved', 'Same publisher-level usage review as news18-malayalam-kerala.', true, 'rss-2.0', array['malayalam.news18.com'], 'https://malayalam.news18.com/rss/', 'verified', 200, 'Valid RSS 2.0; 200 items.', null),
    ('60000000-0000-4000-8000-000000000045', 'oneindia-malayalam-main', 'OneIndia Malayalam', 'Main', 'https://malayalam.oneindia.com/rss/feeds/oneindia-malayalam-fb.xml', 'malayalam.oneindia.com', 'https://malayalam.oneindia.com/', array['india','regional-local','world']::public.news_category[], 'ml', 'IN', null, interval '20 minutes', 'tier-2', 'supplementary', false, 'pending', 'Official RSS page found, but the endpoint returned a Cloudflare 403 HTML response at final verification.', false, 'rss-2.0', array['malayalam.oneindia.com'], 'https://malayalam.oneindia.com/rss/', 'blocked', 403, 'HTML challenge instead of a feed.', 'Endpoint blocks the ingestion client.'),
    ('60000000-0000-4000-8000-000000000046', 'oneindia-malayalam-news', 'OneIndia Malayalam', 'News', 'https://malayalam.oneindia.com/rss/feeds/malayalam-news-fb.xml', 'malayalam.oneindia.com', 'https://malayalam.oneindia.com/', array['india','regional-local']::public.news_category[], 'ml', 'IN', null, interval '20 minutes', 'tier-2', 'supplementary', false, 'pending', 'Official RSS page found, but the endpoint returned a Cloudflare 403 HTML response at final verification.', false, 'rss-2.0', array['malayalam.oneindia.com'], 'https://malayalam.oneindia.com/rss/', 'blocked', 403, 'HTML challenge instead of a feed.', 'Endpoint blocks the ingestion client.'),

    -- Onmanorama explicitly permits personal RSS use but not commercial use.
    ('60000000-0000-4000-8000-000000000047', 'onmanorama-kerala', 'Onmanorama', 'Kerala', 'https://www.onmanorama.com/kerala.feeds.onmrss.xml', 'onmanorama.com', 'https://www.onmanorama.com/', array['regional-local']::public.news_category[], 'en', 'IN', 'Kerala', interval '20 minutes', 'tier-2', 'primary', false, 'approved', 'Feed page permits personal use only and forbids commercial use. Approved only for Bulletin current personal/non-commercial scope; mandatory re-review before external launch.', true, 'rss-2.0', array['www.onmanorama.com','onmanorama.com'], 'https://www.onmanorama.com/rss.html', 'verified', 200, 'Valid RSS 2.0; 10 items.', null),
    ('60000000-0000-4000-8000-000000000048', 'onmanorama-india', 'Onmanorama', 'India', 'https://www.onmanorama.com/news/india.feeds.onmrss.xml', 'onmanorama.com', 'https://www.onmanorama.com/', array['india']::public.news_category[], 'en', 'IN', null, interval '20 minutes', 'tier-2', 'primary', false, 'approved', 'Same publisher-level usage review as onmanorama-kerala.', true, 'rss-2.0', array['www.onmanorama.com','onmanorama.com'], 'https://www.onmanorama.com/rss.html', 'verified', 200, 'Valid RSS 2.0; 10 items.', null),
    ('60000000-0000-4000-8000-000000000049', 'onmanorama-world', 'Onmanorama', 'World', 'https://www.onmanorama.com/news/world.feeds.onmrss.xml', 'onmanorama.com', 'https://www.onmanorama.com/', array['world']::public.news_category[], 'en', null, null, interval '30 minutes', 'tier-2', 'primary', false, 'approved', 'Same publisher-level usage review as onmanorama-kerala.', true, 'rss-2.0', array['www.onmanorama.com','onmanorama.com'], 'https://www.onmanorama.com/rss.html', 'verified', 200, 'Valid RSS 2.0; 10 items.', null),
    ('60000000-0000-4000-8000-000000000050', 'onmanorama-business', 'Onmanorama', 'Business', 'https://www.onmanorama.com/news/business.feeds.onmrss.xml', 'onmanorama.com', 'https://www.onmanorama.com/', array['business-economy']::public.news_category[], 'en', 'IN', null, interval '30 minutes', 'tier-2', 'primary', false, 'approved', 'Same publisher-level usage review as onmanorama-kerala.', true, 'rss-2.0', array['www.onmanorama.com','onmanorama.com'], 'https://www.onmanorama.com/rss.html', 'verified', 200, 'Valid RSS 2.0; 10 items.', null),

    -- Primary institutional feeds.
    ('60000000-0000-4000-8000-000000000051', 'pib-english', 'Press Information Bureau', 'English releases', 'https://pib.gov.in/RssMain.aspx?ModId=6&Lang=1&Regid=1', 'pib.gov.in', 'https://pib.gov.in/', array['india','government-schemes']::public.news_category[], 'en', 'IN', null, interval '20 minutes', 'tier-1', 'primary', true, 'pending', 'Official institutional feed. Advertised English URL redirected to the Hindi feed and returned no English items at final verification.', false, 'rss-2.0', array['pib.gov.in','www.pib.gov.in'], 'https://pib.gov.in/ViewRss.aspx', 'broken', 200, 'Valid but empty RSS after a cross-language redirect.', 'Official English endpoint currently redirects incorrectly.'),
    ('60000000-0000-4000-8000-000000000052', 'pib-hindi', 'Press Information Bureau', 'Hindi releases', 'https://pib.gov.in/RssMain.aspx?ModId=6&Lang=2&Regid=3', 'pib.gov.in', 'https://pib.gov.in/', array['india','government-schemes']::public.news_category[], 'hi', 'IN', null, interval '20 minutes', 'tier-1', 'primary', true, 'approved', 'Official Government of India institutional feed; preserve PIB attribution and treat statements as primary-source claims, not neutral corroboration.', true, 'rss-2.0', array['pib.gov.in','www.pib.gov.in'], 'https://pib.gov.in/ViewRss.aspx', 'verified', 200, 'Valid RSS 2.0; 20 Hindi items.', null),
    ('60000000-0000-4000-8000-000000000053', 'rbi-press-releases', 'Reserve Bank of India', 'Press Releases', 'https://rbi.org.in/pressreleases_rss.xml', 'rbi.org.in', 'https://www.rbi.org.in/', array['business-economy','markets-personal-finance']::public.news_category[], 'en', 'IN', null, interval '30 minutes', 'tier-1', 'primary', true, 'approved', 'Official RBI institutional feed. Preserve attribution and distinguish regulatory statements from independent reporting.', true, 'rss-2.0', array['rbi.org.in','www.rbi.org.in'], 'https://www.rbi.org.in/Scripts/rss.aspx', 'verified', 200, 'Valid RSS 2.0; 10 items.', null),
    ('60000000-0000-4000-8000-000000000054', 'rbi-notifications', 'Reserve Bank of India', 'Notifications', 'https://rbi.org.in/notifications_rss.xml', 'rbi.org.in', 'https://www.rbi.org.in/', array['business-economy','markets-personal-finance']::public.news_category[], 'en', 'IN', null, interval '60 minutes', 'tier-1', 'primary', true, 'approved', 'Same institutional-source review as rbi-press-releases.', true, 'rss-2.0', array['rbi.org.in','www.rbi.org.in'], 'https://www.rbi.org.in/Scripts/rss.aspx', 'verified', 200, 'Valid RSS 2.0; 10 items.', null),
    ('60000000-0000-4000-8000-000000000055', 'rbi-speeches', 'Reserve Bank of India', 'Speeches', 'https://rbi.org.in/speeches_rss.xml', 'rbi.org.in', 'https://www.rbi.org.in/', array['business-economy']::public.news_category[], 'en', 'IN', null, interval '2 hours', 'tier-1', 'supplementary', true, 'approved', 'Same institutional-source review as rbi-press-releases.', true, 'rss-2.0', array['rbi.org.in','www.rbi.org.in'], 'https://www.rbi.org.in/Scripts/rss.aspx', 'verified', 200, 'Valid RSS 2.0; 10 items.', null),
    ('60000000-0000-4000-8000-000000000056', 'sebi-updates', 'Securities and Exchange Board of India', 'SEBI updates', 'https://www.sebi.gov.in/sebirss.xml', 'sebi.gov.in', 'https://www.sebi.gov.in/', array['business-economy','markets-personal-finance']::public.news_category[], 'en', 'IN', null, interval '60 minutes', 'tier-1', 'primary', true, 'approved', 'Official SEBI institutional feed. Preserve attribution and distinguish regulatory statements from independent reporting.', true, 'rss-2.0', array['www.sebi.gov.in','sebi.gov.in'], 'https://www.sebi.gov.in/rss.html', 'verified', 200, 'Valid RSS 2.0; 30 items.', null),

    -- Global coverage. BBC permits attributed RSS display for people; Al
    -- Jazeera prohibits automated scraping; DW asks operators to accept
    -- separate feed terms, so those two are fail-closed.
    ('60000000-0000-4000-8000-000000000057', 'bbc-world', 'BBC News', 'World', 'https://feeds.bbci.co.uk/news/world/rss.xml', 'bbc.com', 'https://www.bbc.com/news', array['world']::public.news_category[], 'en', null, null, interval '15 minutes', 'tier-1', 'supplementary', false, 'approved', 'BBC terms permit attributed RSS use for people; approved for current non-commercial metadata/link use with prominent BBC News attribution. Re-review before external launch.', true, 'rss-2.0', array['feeds.bbci.co.uk'], 'https://downloads.bbc.co.uk/usingthebbc/bbc_terms_of_use_31March2022english.pdf', 'verified', 200, 'Valid RSS 2.0.', null),
    ('60000000-0000-4000-8000-000000000058', 'bbc-asia', 'BBC News', 'Asia', 'https://feeds.bbci.co.uk/news/world/asia/rss.xml', 'bbc.com', 'https://www.bbc.com/news', array['world']::public.news_category[], 'en', null, 'Asia', interval '20 minutes', 'tier-1', 'supplementary', false, 'approved', 'Same publisher-level usage review as bbc-world.', true, 'rss-2.0', array['feeds.bbci.co.uk'], 'https://downloads.bbc.co.uk/usingthebbc/bbc_terms_of_use_31March2022english.pdf', 'verified', 200, 'Valid RSS 2.0.', null),
    ('60000000-0000-4000-8000-000000000059', 'bbc-business', 'BBC News', 'Business', 'https://feeds.bbci.co.uk/news/business/rss.xml', 'bbc.com', 'https://www.bbc.com/news', array['business-economy']::public.news_category[], 'en', null, null, interval '20 minutes', 'tier-1', 'supplementary', false, 'approved', 'Same publisher-level usage review as bbc-world.', true, 'rss-2.0', array['feeds.bbci.co.uk'], 'https://downloads.bbc.co.uk/usingthebbc/bbc_terms_of_use_31March2022english.pdf', 'verified', 200, 'Valid RSS 2.0.', null),
    ('60000000-0000-4000-8000-000000000060', 'bbc-technology', 'BBC News', 'Technology', 'https://feeds.bbci.co.uk/news/technology/rss.xml', 'bbc.com', 'https://www.bbc.com/news', array['technology-ai']::public.news_category[], 'en', null, null, interval '30 minutes', 'tier-1', 'supplementary', false, 'approved', 'Same publisher-level usage review as bbc-world.', true, 'rss-2.0', array['feeds.bbci.co.uk'], 'https://downloads.bbc.co.uk/usingthebbc/bbc_terms_of_use_31March2022english.pdf', 'verified', 200, 'Valid RSS 2.0.', null),
    ('60000000-0000-4000-8000-000000000061', 'bbc-science-environment', 'BBC News', 'Science and Environment', 'https://feeds.bbci.co.uk/news/science_and_environment/rss.xml', 'bbc.com', 'https://www.bbc.com/news', array['science','climate']::public.news_category[], 'en', null, null, interval '30 minutes', 'tier-1', 'supplementary', false, 'approved', 'Same publisher-level usage review as bbc-world.', true, 'rss-2.0', array['feeds.bbci.co.uk'], 'https://downloads.bbc.co.uk/usingthebbc/bbc_terms_of_use_31March2022english.pdf', 'verified', 200, 'Valid RSS 2.0.', null),
    ('60000000-0000-4000-8000-000000000062', 'bbc-health', 'BBC News', 'Health', 'https://feeds.bbci.co.uk/news/health/rss.xml', 'bbc.com', 'https://www.bbc.com/news', array['health']::public.news_category[], 'en', null, null, interval '30 minutes', 'tier-1', 'supplementary', false, 'approved', 'Same publisher-level usage review as bbc-world.', true, 'rss-2.0', array['feeds.bbci.co.uk'], 'https://downloads.bbc.co.uk/usingthebbc/bbc_terms_of_use_31March2022english.pdf', 'verified', 200, 'Valid RSS 2.0.', null),
    ('60000000-0000-4000-8000-000000000063', 'al-jazeera-all', 'Al Jazeera', 'All news', 'https://www.aljazeera.com/xml/rss/all.xml', 'aljazeera.com', 'https://www.aljazeera.com/', array['world']::public.news_category[], 'en', null, null, interval '15 minutes', 'tier-1', 'supplementary', false, 'rejected', 'Current terms prohibit automated technologies used to access, copy, record, analyse, or scrape the service.', false, 'rss-2.0', array['www.aljazeera.com','aljazeera.com'], 'https://www.aljazeera.com/terms-and-conditions/', 'verified', 200, 'Valid RSS 2.0; 25 items.', 'Publisher terms prohibit automated ingestion.'),
    ('60000000-0000-4000-8000-000000000064', 'un-news-global', 'United Nations News', 'Global', 'https://news.un.org/feed/subscribe/en/news/all/rss.xml', 'news.un.org', 'https://news.un.org/en/', array['world']::public.news_category[], 'en', null, null, interval '30 minutes', 'tier-1', 'supplementary', true, 'approved', 'Official UN News institutional feed. Preserve UN attribution and treat institutional statements as primary-source claims.', true, 'rss-2.0', array['news.un.org'], 'https://www.un.org/en/about-us/copyright', 'verified', 200, 'Valid RSS 2.0; 30 items.', null),
    ('60000000-0000-4000-8000-000000000065', 'dw-world', 'Deutsche Welle', 'World', 'https://rss.dw.com/rdf/rss-en-world', 'dw.com', 'https://www.dw.com/', array['world']::public.news_category[], 'en', null, null, interval '30 minutes', 'tier-1', 'supplementary', false, 'pending', 'DW directs website operators to accept separate RSS terms or contact its news service. Keep disabled until that permission step is complete.', false, 'rss-1.0', array['rss.dw.com'], 'https://www.dw.com/en/benefit-from-smart-content-made-in-germany/a-19470839', 'verified', 200, 'Valid RSS 1.0/RDF; 13 items.', 'Publisher permission step has not been completed.'),

    -- Hindustan Times is technically healthy but covered by the same current
    -- automated-access prohibition as Live Hindustan.
    ('60000000-0000-4000-8000-000000000066', 'hindustan-times-india', 'Hindustan Times', 'India News', 'https://www.hindustantimes.com/feeds/rss/india-news/rssfeed.xml', 'hindustantimes.com', 'https://www.hindustantimes.com/', array['india','politics']::public.news_category[], 'en', 'IN', null, interval '15 minutes', 'tier-1', 'primary', false, 'rejected', 'Current HTDSL terms prohibit automated access, caching, archiving, and indexing without a written licence.', false, 'rss-2.0', array['www.hindustantimes.com','hindustantimes.com'], 'https://www.hindustantimes.com/termsofuse', 'verified', 200, 'Valid RSS 2.0; 100 items.', 'Publisher terms prohibit automated ingestion.'),
    ('60000000-0000-4000-8000-000000000067', 'hindustan-times-world', 'Hindustan Times', 'World News', 'https://www.hindustantimes.com/feeds/rss/world-news/rssfeed.xml', 'hindustantimes.com', 'https://www.hindustantimes.com/', array['world']::public.news_category[], 'en', null, null, interval '15 minutes', 'tier-1', 'primary', false, 'rejected', 'Same publisher-level usage review as hindustan-times-india.', false, 'rss-2.0', array['www.hindustantimes.com','hindustantimes.com'], 'https://www.hindustantimes.com/termsofuse', 'verified', 200, 'Valid RSS 2.0; 100 items.', 'Publisher terms prohibit automated ingestion.'),
    ('60000000-0000-4000-8000-000000000068', 'hindustan-times-education', 'Hindustan Times', 'Education', 'https://www.hindustantimes.com/feeds/rss/education/rssfeed.xml', 'hindustantimes.com', 'https://www.hindustantimes.com/', array['education-careers']::public.news_category[], 'en', 'IN', null, interval '30 minutes', 'tier-1', 'primary', false, 'rejected', 'Same publisher-level usage review as hindustan-times-india.', false, 'rss-2.0', array['www.hindustantimes.com','hindustantimes.com'], 'https://www.hindustantimes.com/termsofuse', 'verified', 200, 'Valid RSS 2.0; 23 items.', 'Publisher terms prohibit automated ingestion.')
)
insert into public.sources (
  id, catalogue_key, publisher_name, feed_name, feed_url, publisher_domain,
  publisher_home_url, category_scope, language, country_code, state_region,
  expected_update_interval, reliability, role, is_aggregator, is_institutional,
  terms_status, terms_notes, is_active, health, next_fetch_at, feed_format,
  allowed_hosts, usage_review_url, usage_reviewed_at, technical_status,
  verification_checked_at, verification_http_status, verification_notes,
  disabled_reason, parser_notes
)
select
  id, catalogue_key, publisher_name, feed_name, feed_url, publisher_domain,
  publisher_home_url, category_scope, language, country_code, state_region,
  expected_update_interval, reliability, role, false, is_institutional,
  terms_status, terms_notes, is_active,
  case when is_active then 'unknown'::public.source_health else 'disabled'::public.source_health end,
  case when is_active then statement_timestamp() else null end,
  feed_format, allowed_hosts, usage_review_url,
  '2026-07-18 12:00:00+05:30'::timestamptz, technical_status,
  '2026-07-18 12:00:00+05:30'::timestamptz, verification_http_status,
  verification_notes, disabled_reason,
  case when feed_url like '%livehindustan.com%' then 'Valid XML is served with text/plain; content sniffing is required.' else null end
from catalogue;

-- New columns remain service-role-only. Browser roles keep no table or function
-- access, matching the Phase 2 fail-closed boundary.
revoke all on public.sources, public.articles from public, anon, authenticated;
revoke execute on function bulletin_private.host_array_is_safe(text[]) from public, anon, authenticated;
grant execute on function bulletin_private.host_array_is_safe(text[]) to service_role;

comment on column public.sources.terms_status is
  'Internal usage-review state, not legal advice. Only approved feeds may be active.';
comment on column public.sources.technical_status is
  'Latest catalogue verification state: pending, verified, blocked, or broken.';
comment on column public.sources.allowed_hosts is
  'Exact lowercase host allowlist for the feed URL and any accepted redirects.';
comment on column public.articles.duplicate_of_article_id is
  'Same-source deterministic near-duplicate target. Exact URL duplicates are rejected and not stored.';
