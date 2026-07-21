-- Bulletin Phase 6: targeted post-completion catalogue expansion.
--
-- The owner requested more fresh India-first supply after the initial catalogue
-- was completed. These official RSS endpoints were re-checked immediately
-- before inclusion. Activation remains limited to Bulletin's present private,
-- personal, non-commercial metadata/excerpt/link scope with original publisher
-- attribution. A later external or commercial launch requires a fresh review.

with catalogue_expansion (
  id, catalogue_key, publisher_name, feed_name, feed_url, publisher_domain,
  publisher_home_url, category_scope, language, country_code, state_region,
  expected_update_interval, reliability, role, terms_notes, feed_format,
  allowed_hosts, usage_review_url, verification_notes
) as (
  values
    -- NDTV's official English and Hindi RSS directories grant individuals
    -- personal, non-commercial headline-feed use with NDTV.com attribution.
    ('60000000-0000-4000-8000-000000000069'::uuid, 'ndtv-english-top-stories', 'NDTV.com', 'English — Top Stories', 'https://feeds.feedburner.com/ndtvnews-top-stories', 'ndtv.com', 'https://www.ndtv.com/', array['india','world','business-economy','sports','entertainment']::public.news_category[], 'en'::public.briefing_language, null, null, interval '15 minutes', 'tier-1'::public.source_reliability, 'primary'::public.source_role, 'Official NDTV RSS endpoint. Approved only for Bulletin current private, personal, non-commercial metadata/excerpt/link scope with NDTV.com attribution; re-review before external or commercial launch.', 'rss-2.0', array['feeds.feedburner.com'], 'https://www.ndtv.com/rss?site=classic', 'Valid RSS 2.0 over HTTPS; 20 items at final verification.'),
    ('60000000-0000-4000-8000-000000000070', 'ndtv-english-latest', 'NDTV.com', 'English — Latest', 'https://feeds.feedburner.com/ndtvnews-latest', 'ndtv.com', 'https://www.ndtv.com/', array['india','world','business-economy','sports','entertainment']::public.news_category[], 'en', null, null, interval '15 minutes', 'tier-1', 'primary', 'Same publisher-level usage review as ndtv-english-top-stories.', 'rss-2.0', array['feeds.feedburner.com'], 'https://www.ndtv.com/rss?site=classic', 'Valid RSS 2.0 over HTTPS; 100 items at final verification.'),
    ('60000000-0000-4000-8000-000000000071', 'ndtv-english-india', 'NDTV.com', 'English — India', 'https://feeds.feedburner.com/ndtvnews-india-news', 'ndtv.com', 'https://www.ndtv.com/', array['india','politics']::public.news_category[], 'en', 'IN', null, interval '15 minutes', 'tier-1', 'primary', 'Same publisher-level usage review as ndtv-english-top-stories.', 'rss-2.0', array['feeds.feedburner.com'], 'https://www.ndtv.com/rss?site=classic', 'Valid RSS 2.0 over HTTPS; 20 items at final verification.'),
    ('60000000-0000-4000-8000-000000000072', 'ndtv-english-world', 'NDTV.com', 'English — World', 'https://feeds.feedburner.com/ndtvnews-world-news', 'ndtv.com', 'https://www.ndtv.com/', array['world']::public.news_category[], 'en', null, null, interval '20 minutes', 'tier-1', 'supplementary', 'Same publisher-level usage review as ndtv-english-top-stories.', 'rss-2.0', array['feeds.feedburner.com'], 'https://www.ndtv.com/rss?site=classic', 'Valid RSS 2.0 over HTTPS; 20 items at final verification.'),
    ('60000000-0000-4000-8000-000000000073', 'ndtv-english-cities', 'NDTV.com', 'English — Cities', 'https://feeds.feedburner.com/ndtvnews-cities-news', 'ndtv.com', 'https://www.ndtv.com/', array['regional-local']::public.news_category[], 'en', 'IN', null, interval '20 minutes', 'tier-1', 'primary', 'Same publisher-level usage review as ndtv-english-top-stories.', 'rss-2.0', array['feeds.feedburner.com'], 'https://www.ndtv.com/rss?site=classic', 'Valid RSS 2.0 over HTTPS; 20 items at final verification.'),
    ('60000000-0000-4000-8000-000000000074', 'ndtv-english-south', 'NDTV.com', 'English — South India', 'https://feeds.feedburner.com/ndtvnews-south', 'ndtv.com', 'https://www.ndtv.com/', array['regional-local','india']::public.news_category[], 'en', 'IN', 'South India', interval '20 minutes', 'tier-1', 'primary', 'Same publisher-level usage review as ndtv-english-top-stories.', 'rss-2.0', array['feeds.feedburner.com'], 'https://www.ndtv.com/rss?site=classic', 'Valid RSS 2.0 over HTTPS; 20 items at final verification.'),
    ('60000000-0000-4000-8000-000000000075', 'ndtv-english-indians-abroad', 'NDTV.com', 'English — Indians Abroad', 'https://feeds.feedburner.com/ndtvnews-indians-abroad', 'ndtv.com', 'https://www.ndtv.com/', array['india','world']::public.news_category[], 'en', 'IN', null, interval '30 minutes', 'tier-1', 'supplementary', 'Same publisher-level usage review as ndtv-english-top-stories.', 'rss-2.0', array['feeds.feedburner.com'], 'https://www.ndtv.com/rss?site=classic', 'Valid RSS 2.0 over HTTPS; 20 items at final verification.'),
    ('60000000-0000-4000-8000-000000000076', 'ndtv-hindi-latest', 'NDTV.com', 'Hindi — Latest', 'https://feeds.feedburner.com/ndtvkhabar-latest', 'ndtv.in', 'https://ndtv.in/', array['india','world','business-economy','sports','entertainment']::public.news_category[], 'hi', null, null, interval '15 minutes', 'tier-1', 'primary', 'Official NDTV Hindi RSS endpoint under the same personal, non-commercial, attributed RSS terms as the English directory; re-review before external or commercial launch.', 'rss-2.0', array['feeds.feedburner.com'], 'https://ndtv.in/rss', 'Valid Hindi RSS 2.0 over HTTPS; 100 items at final verification.'),
    ('60000000-0000-4000-8000-000000000077', 'ndtv-hindi-india', 'NDTV.com', 'Hindi — India', 'https://feeds.feedburner.com/ndtvkhabar-india', 'ndtv.in', 'https://ndtv.in/', array['india','politics']::public.news_category[], 'hi', 'IN', null, interval '15 minutes', 'tier-1', 'primary', 'Same publisher-level usage review as ndtv-hindi-latest.', 'rss-2.0', array['feeds.feedburner.com'], 'https://ndtv.in/rss', 'Valid Hindi RSS 2.0 over HTTPS; 100 items at final verification.'),
    ('60000000-0000-4000-8000-000000000078', 'ndtv-hindi-world', 'NDTV.com', 'Hindi — World', 'https://feeds.feedburner.com/ndtvkhabar-world', 'ndtv.in', 'https://ndtv.in/', array['world']::public.news_category[], 'hi', null, null, interval '20 minutes', 'tier-1', 'supplementary', 'Same publisher-level usage review as ndtv-hindi-latest.', 'rss-2.0', array['feeds.feedburner.com'], 'https://ndtv.in/rss', 'Valid Hindi RSS 2.0 over HTTPS; 100 items at final verification.'),
    ('60000000-0000-4000-8000-000000000079', 'ndtv-hindi-business', 'NDTV.com', 'Hindi — Business', 'https://feeds.feedburner.com/ndtvkhabar-business', 'ndtv.in', 'https://ndtv.in/', array['business-economy','markets-personal-finance']::public.news_category[], 'hi', 'IN', null, interval '30 minutes', 'tier-1', 'primary', 'Same publisher-level usage review as ndtv-hindi-latest.', 'rss-2.0', array['feeds.feedburner.com'], 'https://ndtv.in/rss', 'Valid Hindi RSS 2.0 over HTTPS; 100 items at final verification.'),
    ('60000000-0000-4000-8000-000000000080', 'ndtv-hindi-top-stories', 'NDTV.com', 'Hindi — Top Stories', 'https://feeds.feedburner.com/ndtvkhabar-pramukh-khabrein', 'ndtv.in', 'https://ndtv.in/', array['india','world','business-economy']::public.news_category[], 'hi', null, null, interval '15 minutes', 'tier-1', 'primary', 'Same publisher-level usage review as ndtv-hindi-latest.', 'rss-2.0', array['feeds.feedburner.com'], 'https://ndtv.in/rss', 'Valid Hindi RSS 2.0 over HTTPS; 100 items at final verification.'),

    -- India Today's official RSS directory grants personal use and excludes
    -- commercial use without consent. Store only feed-supplied metadata and
    -- direct links for the current private MVP; do not scrape article pages.
    ('60000000-0000-4000-8000-000000000081', 'india-today-latest', 'India Today', 'Latest Stories', 'https://www.indiatoday.in/rss/home', 'indiatoday.in', 'https://www.indiatoday.in/', array['india','world','business-economy','sports','entertainment']::public.news_category[], 'en', null, null, interval '15 minutes', 'tier-1', 'primary', 'Official India Today RSS endpoint. Approved only for Bulletin current private, personal, non-commercial metadata/excerpt/link scope; re-review before external or commercial launch.', 'rss-2.0', array['www.indiatoday.in'], 'https://www.indiatoday.in/rss', 'Valid RSS 2.0 over HTTPS; 136 items at final verification.'),
    ('60000000-0000-4000-8000-000000000082', 'india-today-nation', 'India Today', 'Nation', 'https://www.indiatoday.in/rss/1206514', 'indiatoday.in', 'https://www.indiatoday.in/', array['india','politics']::public.news_category[], 'en', 'IN', null, interval '15 minutes', 'tier-1', 'primary', 'Same publisher-level usage review as india-today-latest.', 'rss-2.0', array['www.indiatoday.in'], 'https://www.indiatoday.in/rss', 'Valid RSS 2.0 over HTTPS; 20 items at final verification.'),
    ('60000000-0000-4000-8000-000000000083', 'india-today-states', 'India Today', 'States', 'https://www.indiatoday.in/rss/1206500', 'indiatoday.in', 'https://www.indiatoday.in/', array['regional-local','india']::public.news_category[], 'en', 'IN', null, interval '20 minutes', 'tier-1', 'primary', 'Same publisher-level usage review as india-today-latest.', 'rss-2.0', array['www.indiatoday.in'], 'https://www.indiatoday.in/rss', 'Valid RSS 2.0 over HTTPS; 20 items at final verification.'),
    ('60000000-0000-4000-8000-000000000084', 'india-today-economy', 'India Today', 'Economy', 'https://www.indiatoday.in/rss/1206513', 'indiatoday.in', 'https://www.indiatoday.in/', array['business-economy','markets-personal-finance']::public.news_category[], 'en', 'IN', null, interval '30 minutes', 'tier-1', 'primary', 'Same publisher-level usage review as india-today-latest.', 'rss-2.0', array['www.indiatoday.in'], 'https://www.indiatoday.in/rss', 'Valid RSS 2.0 over HTTPS; 5 items at final verification.'),
    ('60000000-0000-4000-8000-000000000085', 'india-today-world', 'India Today', 'World', 'https://www.indiatoday.in/rss/1206577', 'indiatoday.in', 'https://www.indiatoday.in/', array['world']::public.news_category[], 'en', null, null, interval '20 minutes', 'tier-1', 'supplementary', 'Same publisher-level usage review as india-today-latest.', 'rss-2.0', array['www.indiatoday.in'], 'https://www.indiatoday.in/rss', 'Valid RSS 2.0 over HTTPS; 20 items at final verification.'),
    ('60000000-0000-4000-8000-000000000086', 'india-today-sports', 'India Today', 'Sports', 'https://www.indiatoday.in/rss/1206550', 'indiatoday.in', 'https://www.indiatoday.in/', array['sports']::public.news_category[], 'en', 'IN', null, interval '20 minutes', 'tier-1', 'primary', 'Same publisher-level usage review as india-today-latest.', 'rss-2.0', array['www.indiatoday.in'], 'https://www.indiatoday.in/rss', 'Valid RSS 2.0 over HTTPS; 20 items at final verification.')
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
  expected_update_interval, reliability, role, false, false,
  'approved'::public.terms_review_status, terms_notes, true,
  'unknown'::public.source_health, statement_timestamp(), feed_format,
  allowed_hosts, usage_review_url, '2026-07-18 13:30:00+05:30'::timestamptz,
  'verified', '2026-07-18 13:30:00+05:30'::timestamptz, 200,
  verification_notes, null, null
from catalogue_expansion;

