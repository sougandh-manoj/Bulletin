begin;

create extension if not exists pgtap with schema extensions;
select plan(50);

select is((select count(*)::integer from public.sources where catalogue_key is not null), 95, 'catalogue contains 95 reviewed feeds');
select is((select count(*)::integer from public.sources where technical_status = 'verified'), 92, '92 feeds passed final technical verification');
select is((select count(*)::integer from public.sources where is_active), 48, '48 feeds are fail-closed approved and scheduled');
select is((select count(*)::integer from public.sources where not is_active), 47, '47 reviewed feeds remain visibly disabled');
select is((select count(*)::integer from public.sources where terms_status = 'approved'), 48, 'only usage-approved feeds are active');
select is((select count(*)::integer from public.sources where terms_status = 'restricted'), 27, '27 feeds are retained with explicit usage restrictions');
select is((select count(*)::integer from public.sources where terms_status = 'rejected'), 16, '16 feeds are rejected by current automated-access terms');
select is((select count(*)::integer from public.sources where terms_status = 'pending'), 4, 'four feeds await permission or technical recovery');
select is((select count(*)::integer from public.sources where is_active and language = 'ml'), 5, 'active catalogue includes Malayalam coverage');
select is((select count(*)::integer from public.sources where is_active and language = 'hi'), 7, 'active catalogue includes seven Hindi feeds');
select is((select count(*)::integer from public.sources where is_active and language = 'en'), 36, 'active catalogue includes 36 English feeds');
select is((select count(*)::integer from public.sources where is_active and publisher_name = 'NDTV.com'), 12, 'all 12 reviewed NDTV feeds are active');
select is((select count(*)::integer from public.sources where is_active and publisher_name = 'India Today'), 6, 'all six reviewed India Today feeds are active');
select is(
  (
    select count(*)::integer
    from public.sources
    where id between '60000000-0000-4000-8000-000000000069'::uuid
      and '60000000-0000-4000-8000-000000000086'::uuid
      and technical_status = 'verified'
      and terms_status = 'approved'
      and usage_review_url is not null
      and cardinality(allowed_hosts) > 0
  ),
  18,
  'every expansion feed retains verified technical and usage-review metadata'
);
select is(
  (
    select count(*)::integer
    from public.sources
    where id between '60000000-0000-4000-8000-000000000087'::uuid
      and '60000000-0000-4000-8000-000000000095'::uuid
      and is_active
      and technical_status = 'verified'
      and terms_status = 'approved'
      and usage_review_url is not null
      and cardinality(allowed_hosts) > 0
  ),
  9,
  'all nine specialist feeds are active with technical and usage-review metadata'
);
select is(
  (select count(*)::integer from public.sources where is_active and category_scope @> array['technology-ai']::public.news_category[]),
  3,
  'active catalogue has three technology and AI feeds'
);
select is(
  (select count(*)::integer from public.sources where is_active and category_scope @> array['science']::public.news_category[]),
  3,
  'active catalogue has three science feeds'
);
select is(
  (select count(*)::integer from public.sources where is_active and category_scope @> array['health']::public.news_category[]),
  3,
  'active catalogue has three health feeds'
);
select is(
  (select count(*)::integer from public.sources where is_active and category_scope @> array['climate']::public.news_category[]),
  4,
  'active catalogue has four climate feeds'
);
select is(
  (select count(*)::integer from public.sources where catalogue_key in ('nasa-news-releases', 'who-news-english') and is_institutional),
  2,
  'NASA and WHO retain institutional-source provenance'
);
select is(
  (select count(*)::integer from public.sources where catalogue_key in ('tech-xplore-ai-machine-learning', 'phys-org-science-technology', 'medical-xpress-health') and parser_notes like 'Fetch with Bulletin descriptive metadata-reader User-Agent%'),
  3,
  'Science X feeds record their descriptive User-Agent requirement'
);
select is(
  (select count(*)::integer from public.sources where catalogue_key in ('mongabay-india-climate', 'mongabay-hindi-climate') and country_code = 'IN'),
  2,
  'Mongabay climate feeds retain India geography in both languages'
);
select ok((select count(*) > 0 from public.sources where state_region is not null), 'catalogue records state and regional scope');
select is((select count(*)::integer from public.sources where is_active and terms_status <> 'approved'), 0, 'no non-approved source can be active');
select is((select count(*)::integer from public.sources where is_active and technical_status <> 'verified'), 0, 'no unverified source can be active');
select is((select count(*)::integer from public.sources where not is_active and health <> 'disabled'), 0, 'disabled catalogue records have disabled health');
select is((select count(*)::integer from public.sources where catalogue_key is not null and cardinality(allowed_hosts) = 0), 0, 'every catalogue feed has a redirect host allowlist');
select is((select count(distinct feed_url)::integer from public.sources where catalogue_key is not null), 95, 'catalogue feed URLs are unique');
select ok(
  not has_function_privilege('anon', 'public.complete_source_ingestion(uuid,uuid,text,timestamptz,integer,text,text,integer,text,integer,integer,text,timestamptz,text,timestamptz)', 'EXECUTE'),
  'anon cannot finish an ingestion claim'
);
select ok(
  not has_function_privilege('authenticated', 'public.insert_ingested_article(uuid,uuid,text,text,text,text,bytea,bytea,text,text,timestamptz,briefing_language,text,text,text,text[],jsonb,text,timestamptz,text,text,text,uuid,text,text,timestamptz)', 'EXECUTE'),
  'authenticated users cannot insert ingested articles'
);

-- Isolate one known-good catalogue source and exercise lease ownership.
update public.sources
set next_fetch_at = '2026-07-19 00:00:00+00'
where is_active;
update public.sources
set next_fetch_at = '2026-07-18 00:00:00+00'
where catalogue_key = 'rbi-press-releases';

create temporary table phase_6_source_claim as
select * from public.claim_due_sources(
  '61000000-0000-4000-8000-000000000001'::uuid, 10, 120,
  '2026-07-18 01:00:00+00'
);
create temporary table phase_6_duplicate_claim as
select * from public.claim_due_sources(
  '61000000-0000-4000-8000-000000000002'::uuid, 10, 120,
  '2026-07-18 01:00:00+00'
);

select is((select count(*)::integer from phase_6_source_claim), 1, 'one due source is claimed atomically');
select is((select count(*)::integer from phase_6_duplicate_claim), 0, 'an overlapping worker cannot steal the source lease');
select ok(
  not public.complete_source_ingestion(
    (select source_id from phase_6_source_claim), gen_random_uuid(), 'success',
    '2026-07-18 02:00:00+00', 200, 'etag-stale', null, 100, null,
    0, 0, null, null, 'phase-6-v1', '2026-07-18 01:01:00+00'
  ),
  'a stale lease token cannot complete source work'
);
select ok(
  public.complete_source_ingestion(
    (select source_id from phase_6_source_claim),
    (select lease_token from phase_6_source_claim), 'failure',
    '2026-07-18 01:10:00+00', 429, null, null, 50,
    'https://rbi.org.in/pressreleases_rss.xml', 0, 0, 'http-rate-limited',
    '2026-07-18 01:10:00+00', null, '2026-07-18 01:01:00+00'
  ),
  'lease owner records an isolated rate-limit failure'
);
select is((select consecutive_failures from public.sources where catalogue_key = 'rbi-press-releases'), 1, 'failure count increments');
select is((select health::text from public.sources where catalogue_key = 'rbi-press-releases'), 'degraded', 'first failure degrades source health');
select is((select last_error_code from public.sources where catalogue_key = 'rbi-press-releases'), 'http-rate-limited', 'safe failure code is retained');
select ok((select lease_token is null from public.sources where catalogue_key = 'rbi-press-releases'), 'completion releases the source lease');

-- Claim again and hold the lease while testing idempotent article writes.
create temporary table phase_6_article_source_claim as
select * from public.claim_due_sources(
  '61000000-0000-4000-8000-000000000003'::uuid, 1, 120,
  '2026-07-18 01:11:00+00'
);

create temporary table phase_6_first_article as
select * from public.insert_ingested_article(
  (select source_id from phase_6_article_source_claim),
  (select lease_token from phase_6_article_source_claim),
  'RBI issues a policy update', 'rbi issues a policy update',
  'https://rbi.org.in/update?utm_source=rss', 'https://rbi.org.in/update',
  digest('https://rbi.org.in/update', 'sha256'),
  digest('rbi issues a policy update', 'sha256'),
  'A fixture description', 'Reserve Bank of India', '2026-07-18 01:00:00+00',
  'en', 'IN', null, null, array['policy'], '{"fixture":true}'::jsonb,
  'rbi-guid-1', null, 'pubDate', 'source', 'source', null, null,
  'phase-6-v1', '2026-07-18 01:11:00+00'
);
select is((select outcome from phase_6_first_article), 'inserted', 'first canonical article is inserted');

create temporary table phase_6_exact_duplicate as
select * from public.insert_ingested_article(
  (select source_id from phase_6_article_source_claim),
  (select lease_token from phase_6_article_source_claim),
  'RBI issues a policy update again', 'rbi issues a policy update again',
  'https://rbi.org.in/update?utm_medium=rss', 'https://rbi.org.in/update',
  digest('https://rbi.org.in/update', 'sha256'),
  digest('rbi issues a policy update again', 'sha256'),
  null, null, '2026-07-18 01:05:00+00', 'en', 'IN', null, null, '{}', '{}'::jsonb,
  'rbi-guid-2', null, 'pubDate', 'source', 'source', null, null,
  'phase-6-v1', '2026-07-18 01:11:00+00'
);
select is((select outcome from phase_6_exact_duplicate), 'exact-duplicate', 'canonical URL hash rejects an exact duplicate');
select is((select count(*)::integer from public.articles where canonical_url = 'https://rbi.org.in/update'), 1, 'exact duplicate creates no second row');

create temporary table phase_6_near_duplicate as
select * from public.insert_ingested_article(
  (select source_id from phase_6_article_source_claim),
  (select lease_token from phase_6_article_source_claim),
  'RBI issues its policy update', 'rbi issues its policy update',
  'https://rbi.org.in/update-brief', 'https://rbi.org.in/update-brief',
  digest('https://rbi.org.in/update-brief', 'sha256'),
  digest('rbi issues its policy update', 'sha256'),
  null, null, '2026-07-18 02:00:00+00', 'en', 'IN', null, null, '{}', '{}'::jsonb,
  'rbi-guid-3', null, 'pubDate', 'source', 'source',
  (select article_id from phase_6_first_article), 'same-source-near-title',
  'phase-6-v1', '2026-07-18 02:01:00+00'
);
select is((select outcome from phase_6_near_duplicate), 'near-duplicate', 'bounded same-source near duplicate is recorded');
select is(
  (select processing_status::text from public.articles where id = (select article_id from phase_6_near_duplicate)),
  'quarantined',
  'near duplicate is quarantined before Phase 7 processing'
);
select throws_ok(
  format(
    $query$select * from public.insert_ingested_article(
      %L::uuid, %L::uuid, 'Late duplicate', 'late duplicate',
      'https://rbi.org.in/late', 'https://rbi.org.in/late',
      digest('https://rbi.org.in/late', 'sha256'), digest('late duplicate', 'sha256'),
      null, null, '2026-07-19 02:00:01+00', 'en', 'IN', null, null, '{}', '{}'::jsonb,
      'rbi-guid-late', null, 'pubDate', 'source', 'source', %L::uuid,
      'same-source-near-title', 'phase-6-v1', '2026-07-19 02:01:00+00'
    )$query$,
    (select source_id from phase_6_article_source_claim),
    (select lease_token from phase_6_article_source_claim),
    (select article_id from phase_6_first_article)
  ),
  '22023',
  'near duplicate is outside the 6-hour bound',
  'database rejects near-duplicate claims outside the deterministic time bound'
);

create temporary table phase_6_bulk_result as
select public.insert_ingested_articles(
  (select source_id from phase_6_article_source_claim),
  (select lease_token from phase_6_article_source_claim),
  jsonb_build_array(
    jsonb_build_object(
      'id', '62000000-0000-4000-8000-000000000001',
      'originalTitle', 'Bulk fixture story',
      'normalizedTitle', 'bulk fixture story',
      'originalUrl', 'https://rbi.org.in/bulk-story?utm_source=rss',
      'canonicalUrl', 'https://rbi.org.in/bulk-story',
      'canonicalUrlHash', encode(digest('https://rbi.org.in/bulk-story', 'sha256'), 'hex'),
      'normalizedTitleHash', encode(digest('bulk fixture story', 'sha256'), 'hex'),
      'publishedAt', '2026-07-18T01:30:00.000Z',
      'declaredLanguage', 'en',
      'countryCode', 'IN',
      'feedCategories', jsonb_build_array('policy'),
      'rawMetadata', '{}'::jsonb,
      'timestampSource', 'published',
      'languageSource', 'source',
      'geographySource', 'source',
      'normalizationVersion', 'phase-6-v1'
    ),
    jsonb_build_object(
      'id', '62000000-0000-4000-8000-000000000002',
      'originalTitle', 'Bulk exact duplicate',
      'normalizedTitle', 'bulk exact duplicate',
      'originalUrl', 'https://rbi.org.in/bulk-story?utm_medium=rss',
      'canonicalUrl', 'https://rbi.org.in/bulk-story',
      'canonicalUrlHash', encode(digest('https://rbi.org.in/bulk-story', 'sha256'), 'hex'),
      'normalizedTitleHash', encode(digest('bulk exact duplicate', 'sha256'), 'hex'),
      'publishedAt', '2026-07-18T01:31:00.000Z',
      'declaredLanguage', 'en',
      'countryCode', 'IN',
      'feedCategories', '[]'::jsonb,
      'rawMetadata', '{}'::jsonb,
      'timestampSource', 'published',
      'languageSource', 'source',
      'geographySource', 'source',
      'normalizationVersion', 'phase-6-v1'
    )
  ),
  '2026-07-18 02:01:30+00'
) as result;
select is(((select result from phase_6_bulk_result)->>'inserted')::integer, 1, 'bulk RPC inserts every unique normalized article in one lease-bound call');
select is(((select result from phase_6_bulk_result)->>'exactDuplicates')::integer, 1, 'bulk RPC rejects exact canonical duplicates without failing the source');

select ok(
  public.complete_source_ingestion(
    (select source_id from phase_6_article_source_claim),
    (select lease_token from phase_6_article_source_claim), 'success',
    '2026-07-18 02:30:00+00', 200, '"rbi-etag"',
    'Sat, 18 Jul 2026 01:00:00 GMT', 6400,
    'https://rbi.org.in/pressreleases_rss.xml', 2, 2, null, null,
    'phase-6-v1', '2026-07-18 02:02:00+00'
  ),
  'successful fetch completes the article source claim'
);
select is((select consecutive_failures from public.sources where catalogue_key = 'rbi-press-releases'), 0, 'success resets failures for recovery');
select is((select health::text from public.sources where catalogue_key = 'rbi-press-releases'), 'healthy', 'success restores healthy state');
select is((select last_error_code from public.sources where catalogue_key = 'rbi-press-releases'), null, 'success clears the last error code');

select * from finish();
rollback;
