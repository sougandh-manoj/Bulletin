begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;
select plan(67);

select is((select count(*)::integer from public.sources where is_active), 48, 'Phase 7 does not activate another source');
select is((select count(*)::integer from public.sources where not is_active), 47, 'all 47 disabled sources remain disabled');
select is((select count(*)::integer from public.sources), 95, 'source catalogue remains unchanged');
select is((select count(*)::integer from public.sources where publisher_family_key is null), 0, 'every source has a reviewed publisher-family key');
select is((select count(*)::integer from public.sources where publisher_family_key = 'science-x'), 3, 'Science X publications share one evidence family');
select is((select count(distinct publisher_family_key)::integer from public.sources where publisher_name = 'NDTV.com'), 1, 'NDTV feeds share one publisher family');
select is((select count(distinct publisher_family_key)::integer from public.sources where publisher_name in ('Mongabay India', 'Mongabay Hindi')), 1, 'related Mongabay language editions share one publisher family');
select ok(exists(
  select 1 from pg_catalog.pg_enum e join pg_catalog.pg_type t on t.oid = e.enumtypid
  where t.typname = 'summary_status' and e.enumlabel = 'retry-wait'
), 'summary work has an explicit resumable retry state');
select is(
  (select count(*)::integer from information_schema.columns
   where table_schema = 'public' and table_name = 'articles'
     and column_name in ('embedding', 'embedding_model', 'embedding_provider', 'embedding_dimensions')),
  0,
  'article embedding columns are absent'
);
select ok(not has_table_privilege('anon', 'bulletin_private.ai_provider_usage_windows', 'SELECT'), 'browser roles cannot read provider quota counters');
select ok(not has_function_privilege('anon', 'public.reserve_ai_provider_usage(text,text,text,integer,integer,integer,integer,integer,integer,integer,timestamptz)', 'EXECUTE'), 'anon cannot reserve provider quota');
select ok(not has_function_privilege('authenticated', 'public.commit_article_to_story_cluster(uuid,uuid,uuid,text,jsonb,boolean,boolean,jsonb,uuid,text,text,timestamptz)', 'EXECUTE'), 'authenticated users cannot commit story clusters');
select ok(has_function_privilege('service_role', 'public.commit_article_to_story_cluster(uuid,uuid,uuid,text,jsonb,boolean,boolean,jsonb,uuid,text,text,timestamptz)', 'EXECUTE'), 'service role can execute the atomic cluster commit');

create temporary table phase_7_sources as
select
  (select id from public.sources where catalogue_key = 'rbi-press-releases') as rbi_id,
  (select id from public.sources where publisher_name = 'NDTV.com' order by id limit 1) as news_id,
  (select id from public.sources where publisher_name = 'Press Information Bureau' order by id limit 1) as syndicated_id;

insert into public.articles (
  id, source_id, original_title, normalized_title, description, canonical_url,
  canonical_url_hash, normalized_title_hash, published_at, declared_language,
  country_code, state_region, city, processing_status, processing_attempts, next_processing_at,
  duplicate_of_article_id, duplicate_kind
) values
  ('70000000-0000-4000-8000-000000000001', (select rbi_id from phase_7_sources),
   'RBI opens a 10 crore grant', 'rbi opens a 10 crore grant', 'Applications open in Kochi',
   'https://rbi.example/phase7-a', digest('phase7-a', 'sha256'), digest('phase7-title-a', 'sha256'),
   '2026-07-18 09:00:00+00', 'en', 'IN', 'Kerala', 'Kochi', 'pending', 0, '2026-07-18 09:00:00+00', null, null),
  ('70000000-0000-4000-8000-000000000002', (select news_id from phase_7_sources),
   'Government confirms the 10 crore grant', 'government confirms the 10 crore grant', 'Applications remain open in Kochi',
   'https://news.example/phase7-b', digest('phase7-b', 'sha256'), digest('phase7-title-b', 'sha256'),
   '2026-07-18 09:10:00+00', 'en', 'IN', 'Kerala', 'Kochi', 'pending', 0, '2026-07-18 10:10:00+00', null, null),
  ('70000000-0000-4000-8000-000000000003', (select syndicated_id from phase_7_sources),
   'RBI opens a 10 crore grant', 'rbi opens a 10 crore grant', 'Applications open in Kochi',
   'https://pib.example/phase7-c', digest('phase7-c', 'sha256'), digest('phase7-title-c', 'sha256'),
   '2026-07-18 09:20:00+00', 'en', 'IN', 'Kerala', 'Kochi', 'pending', 0, '2026-07-18 10:20:00+00', null, null),
  ('70000000-0000-4000-8000-000000000004', (select rbi_id from phase_7_sources),
   'Exhausted fixture', 'exhausted fixture', null, 'https://rbi.example/phase7-exhausted',
   digest('phase7-exhausted', 'sha256'), digest('phase7-exhausted-title', 'sha256'),
   '2026-07-18 09:30:00+00', 'en', 'IN', null, null, 'pending', 5, '2026-07-18 09:00:00+00', null, null),
  ('70000000-0000-4000-8000-000000000005', (select rbi_id from phase_7_sources),
   'Same source duplicate', 'same source duplicate', null, 'https://rbi.example/phase7-duplicate',
   digest('phase7-duplicate', 'sha256'), digest('phase7-duplicate-title', 'sha256'),
   '2026-07-18 09:31:00+00', 'en', 'IN', null, null, 'quarantined', 0, '2026-07-18 09:00:00+00',
   '70000000-0000-4000-8000-000000000001', 'same-source-near-title');

insert into public.articles (
  id, source_id, original_title, normalized_title, canonical_url, canonical_url_hash,
  normalized_title_hash, published_at, declared_language, country_code,
  processing_status, processing_attempts, next_processing_at,
  lease_token, lease_owner, lease_expires_at
) values (
  '70000000-0000-4000-8000-000000000006', (select rbi_id from phase_7_sources),
  'Expired lease fixture', 'expired lease fixture', 'https://rbi.example/phase7-expired',
  digest('phase7-expired', 'sha256'), digest('phase7-expired-title', 'sha256'),
  '2026-07-18 08:00:00+00', 'en', 'IN', 'claimed', 1, '2026-07-18 08:00:00+00',
  '72000000-0000-4000-8000-000000000001', '72000000-0000-4000-8000-000000000002',
  '2026-07-18 09:00:00+00'
);

create temporary table phase_7_expired_reclaim as
select * from public.claim_articles('71000000-0000-4000-8000-000000000009', 1, 300, '2026-07-18 10:00:00+00');
select is((select article_id from phase_7_expired_reclaim), '70000000-0000-4000-8000-000000000006'::uuid, 'expired article lease is reclaimable');
select isnt((select lease_token from phase_7_expired_reclaim), '72000000-0000-4000-8000-000000000001'::uuid, 'reclaim replaces the stale article lease token');
select ok(public.finish_article_claim(
  (select article_id from phase_7_expired_reclaim), (select lease_token from phase_7_expired_reclaim),
  'failed', null, 'expired-fixture-complete', '2026-07-18 10:00:01+00'
), 'reclaimed article can be safely finalized');

select is((select processing_status::text from public.articles where id = '70000000-0000-4000-8000-000000000005'), 'quarantined', 'same-source duplicate is never claimable');
select is((select processing_status::text from public.articles where id = '70000000-0000-4000-8000-000000000004'), 'pending', 'attempt-exhausted article remains unclaimed');

create temporary table phase_7_first_claim as
select * from public.claim_articles('71000000-0000-4000-8000-000000000001', 1, 300, '2026-07-18 10:00:00+00');
select is((select count(*)::integer from phase_7_first_claim), 1, 'one article is claimed with a bounded lease');
select is((select count(*)::integer from public.claim_articles('71000000-0000-4000-8000-000000000002', 1, 300, '2026-07-18 10:00:00+00')), 0, 'overlapping worker cannot steal the article lease');
select ok(not public.stage_article_intelligence(
  '70000000-0000-4000-8000-000000000001', gen_random_uuid(),
  '{"status":"ready","category":"government-schemes","topics":["grant"],"geography":{"countryCode":"IN","stateRegion":"Kerala","city":"Kochi"}}'::jsonb, 'phase-7-v1',
  '{"people":[],"organizations":["RBI"],"locations":["Kochi"]}'::jsonb, 'grant-announcement',
  '2026-07-18 09:00:00+00', 'opens grant', 'applications open',
  '[{"label":"grant","value":"10","unit":"crore","qualifier":null}]'::jsonb, '{}'::text[], 2::smallint,
  digest('phase7-event', 'sha256'), '{"fixture":true}'::jsonb
), 'stale lease cannot stage article intelligence');
select ok(public.stage_article_intelligence(
  '70000000-0000-4000-8000-000000000001', (select lease_token from phase_7_first_claim),
  '{"status":"ready","category":"government-schemes","topics":["grant"],"geography":{"countryCode":"IN","stateRegion":"Kerala","city":"Kochi"}}'::jsonb, 'phase-7-v1',
  '{"people":[],"organizations":["RBI"],"locations":["Kochi"]}'::jsonb, 'grant-announcement',
  '2026-07-18 09:00:00+00', 'opens grant', 'applications open',
  '[{"label":"grant","value":"10","unit":"crore","qualifier":null}]'::jsonb, '{}'::text[], 2::smallint,
  digest('phase7-event', 'sha256'), '{"fixture":true}'::jsonb
), 'lease owner stages strict local public-news intelligence');
select is((select classification_version from public.articles where id = '70000000-0000-4000-8000-000000000001'), 'phase-7-v1', 'local analysis provenance is stored');
select is((select event_type from public.articles where id = '70000000-0000-4000-8000-000000000001'), 'grant-announcement', 'deterministic event identity is stored');
select is((select event_city from public.articles where id = '70000000-0000-4000-8000-000000000001'), 'Kochi', 'classified event geography is stored separately from source scope');
select is((select count(*)::integer from public.find_article_cluster_candidates('70000000-0000-4000-8000-000000000001', 99, 96)), 0, 'rule-based retrieval proposes no cluster before one exists');

create temporary table phase_7_first_commit as
select public.commit_article_to_story_cluster(
  '70000000-0000-4000-8000-000000000001', (select lease_token from phase_7_first_claim), null,
  'deterministic-new-event', '{"reasonCodes":["new-event"]}'::jsonb, false, false, '[]'::jsonb,
  null, null, 'phase-7-v1', '2026-07-18 10:01:00+00'
) as result;
select is((select result->>'clusterStatus' from phase_7_first_commit), 'verified', 'eligible non-sensitive direct evidence verifies a cluster');
select is((select processing_status::text from public.articles where id = '70000000-0000-4000-8000-000000000001'), 'processed', 'cluster commit atomically completes the article');
select throws_ok(
  format($q$select public.commit_article_to_story_cluster(
    '70000000-0000-4000-8000-000000000001', %L::uuid, null,
    'deterministic-new-event', '{}'::jsonb, false, false, '[]'::jsonb,
    null, null, 'phase-7-v1', '2026-07-18 10:01:01+00')$q$,
    (select lease_token from phase_7_first_claim)),
  '55000', 'active article lease required',
  'completed article cannot be committed twice with its stale lease'
);
select is((select (result->>'independentEvidenceUnits')::integer from phase_7_first_commit), 1, 'first publisher family contributes one evidence unit');
select is((select count(*)::integer from public.cluster_summaries where language = 'en' and status = 'pending'), 1, 'verified cluster queues one canonical English summary');
select throws_ok(
  format($q$select public.enqueue_cluster_localization(%L::uuid, 1, 'hi', '2026-07-18 10:01:30+00')$q$,
    (select result->>'clusterId' from phase_7_first_commit)),
  '55000', 'verified canonical summary required',
  'localization cannot be queued before canonical English verification'
);

create temporary table phase_7_summary_claim as
select * from public.claim_cluster_summaries('71000000-0000-4000-8000-000000000003', 5, 300, '2026-07-18 10:02:00+00');
select is((select count(*)::integer from phase_7_summary_claim), 1, 'canonical summary job is claimed with a lease');
select is((select count(*)::integer from public.claim_cluster_summaries('71000000-0000-4000-8000-000000000004', 5, 300, '2026-07-18 10:02:00+00')), 0, 'another summary worker cannot steal an active lease');
update public.cluster_summaries
set lease_expires_at = '2026-07-18 10:01:00+00'
where id = (select summary_id from phase_7_summary_claim);
create temporary table phase_7_summary_reclaim as
select * from public.claim_cluster_summaries('71000000-0000-4000-8000-000000000010', 5, 300, '2026-07-18 10:02:00+00');
select is((select count(*)::integer from phase_7_summary_reclaim), 1, 'expired summary lease is reclaimable');
select isnt((select lease_token from phase_7_summary_reclaim), (select lease_token from phase_7_summary_claim), 'summary reclaim replaces the stale lease token');
select throws_ok(
  format($q$select public.complete_cluster_summary_claim(
    p_summary_id => %L::uuid, p_lease_token => %L::uuid, p_status => 'verified',
    p_headline => 'Grant opens', p_summary => 'RBI opened a 10 crore grant. Applications are open. The program supports local work.',
    p_why_it_matters => 'The funding may support projects.', p_attribution_markers => '[]'::jsonb,
    p_verification_result => '{"passed":true}'::jsonb, p_prompt_version => 'phase-7-v1', p_schema_version => 'phase-7-v1',
    p_provider => 'fixture', p_model => 'fixture-model', p_model_metadata => '{"fixture":true}'::jsonb,
    p_source_article_ids => array['70000000-0000-4000-8000-000000000002'::uuid],
    p_verification_version => 'phase-7-v1', p_now => '2026-07-18 10:03:00+00')$q$,
    (select summary_id from phase_7_summary_reclaim), (select lease_token from phase_7_summary_reclaim)),
  '22023', 'summary citation is not accepted cluster evidence',
  'summary completion rejects a citation outside accepted cluster evidence'
);
select ok(public.complete_cluster_summary_claim(
  p_summary_id => (select summary_id from phase_7_summary_reclaim),
  p_lease_token => (select lease_token from phase_7_summary_reclaim), p_status => 'verified',
  p_headline => 'RBI opens 10 crore grant',
  p_summary => 'RBI opened a 10 crore grant. Applications are open. The program supports local work.',
  p_why_it_matters => 'The funding may support projects.',
  p_attribution_markers => jsonb_build_array(jsonb_build_object('articleId', '70000000-0000-4000-8000-000000000001', 'publisherName', 'Reserve Bank of India')),
  p_verification_result => '{"passed":true}'::jsonb, p_prompt_version => 'phase-7-v1', p_schema_version => 'phase-7-v1',
  p_provider => 'fixture', p_model => 'fixture-model', p_model_metadata => '{"fixture":true}'::jsonb,
  p_source_article_ids => array['70000000-0000-4000-8000-000000000001'::uuid],
  p_verification_version => 'phase-7-v1', p_now => '2026-07-18 10:03:00+00'
), 'valid grounded summary completes through the active lease');
select is((select source_references->0->>'publisherName' from public.cluster_summaries where id = (select summary_id from phase_7_summary_claim)), 'Reserve Bank of India', 'exact publisher attribution is retained');
select is((select count(*)::integer from public.cluster_summary_articles where summary_id = (select summary_id from phase_7_summary_claim)), 1, 'verified citation relation is stored once');
select isnt(public.enqueue_cluster_localization((select (result->>'clusterId')::uuid from phase_7_first_commit), 1, 'hi', '2026-07-18 10:04:00+00'), null::uuid, 'Hindi localization queues after English verification');
select isnt(public.enqueue_cluster_localization((select (result->>'clusterId')::uuid from phase_7_first_commit), 1, 'ml', '2026-07-18 10:04:00+00'), null::uuid, 'Malayalam localization queues after English verification');
select is(
  public.enqueue_cluster_localization((select (result->>'clusterId')::uuid from phase_7_first_commit), 1, 'hi', '2026-07-18 10:04:01+00'),
  (select id from public.cluster_summaries where cluster_id = (select (result->>'clusterId')::uuid from phase_7_first_commit) and cluster_version = 1 and language = 'hi'),
  'localization enqueue is idempotent per cluster version and language'
);

select ok((select allowed from public.reserve_ai_provider_usage('fixture', 'fixture-model', 'summarization', 10, 100, 10000, 3, 10000, 0, 0, '2026-07-18 10:00:00+00')), 'first summary fits the daily budget');
select ok((select allowed from public.reserve_ai_provider_usage('fixture', 'fixture-model', 'summarization', 10, 100, 10000, 3, 10000, 0, 0, '2026-07-18 10:00:01+00')), 'second summary fits the daily budget');
select ok((select allowed from public.reserve_ai_provider_usage('fixture', 'fixture-model', 'summarization', 10, 100, 10000, 3, 10000, 0, 0, '2026-07-18 10:00:02+00')), 'third summary fits the daily budget');
select ok(not (select allowed from public.reserve_ai_provider_usage('fixture', 'fixture-model', 'summarization', 10, 100, 10000, 3, 10000, 0, 0, '2026-07-18 10:00:03+00')), 'a fourth summary is stopped by the daily ceiling');
select ok((select allowed from public.reserve_ai_provider_usage('fixture', 'fixture-localization-model', 'localization', 10, 100, 10000, 3, 10000, 0, 0, '2026-07-18 10:00:04+00')), 'requested localization uses the same generation-only guard');
select ok(not (select allowed from public.reserve_ai_provider_usage('fixture', 'fixture-unit-model', 'summarization', 10001, 100, 10000, 10, 10000, 0, 0, '2026-07-18 10:00:05+00')), 'summary work cannot exceed the configured input-unit ceiling');

update public.articles set next_processing_at = '2026-07-18 10:05:00+00' where id = '70000000-0000-4000-8000-000000000002';
create temporary table phase_7_second_claim as
select * from public.claim_articles('71000000-0000-4000-8000-000000000005', 1, 300, '2026-07-18 10:05:00+00');
select is((select count(*)::integer from phase_7_second_claim), 1, 'second independent article is claimed');
select ok(public.stage_article_intelligence(
  '70000000-0000-4000-8000-000000000002', (select lease_token from phase_7_second_claim),
  '{"status":"ready","category":"government-schemes","topics":["grant"],"geography":{"countryCode":"IN","stateRegion":"Kerala","city":"Kochi"}}'::jsonb, 'phase-7-v1',
  '{"people":[],"organizations":["RBI"],"locations":["Kochi"]}'::jsonb, 'grant-announcement',
  '2026-07-18 09:00:00+00', 'confirms grant', 'applications remain open',
  '[{"label":"grant","value":"10","unit":"crore","qualifier":null}]'::jsonb, array['political'], 3::smallint,
  digest('phase7-event', 'sha256'), '{"fixture":true}'::jsonb
), 'second article intelligence is staged');

insert into public.story_clusters (
  status, category, country_code, state_region, city, central_topics, entities, evidence_strength,
  latest_event_at, event_type, important_numbers, event_fingerprint
)
select 'open', 'government-schemes', 'IN', 'Kerala', 'Kochi', array['fixture'],
  '{"people":[],"organizations":["Fixture"],"locations":["Kochi"]}'::jsonb, 'weak',
  '2026-07-18 09:00:00+00', 'fixture-event', '[]'::jsonb, digest('phase7-candidate-' || series, 'sha256')
from generate_series(1, 25) as series;
select ok((select count(*) <= 20 from public.find_article_cluster_candidates('70000000-0000-4000-8000-000000000002', 999, 999)), 'rule-based candidate retrieval remains capped at 20');

create temporary table phase_7_second_commit as
select public.commit_article_to_story_cluster(
  '70000000-0000-4000-8000-000000000002', (select lease_token from phase_7_second_claim),
  (select (result->>'clusterId')::uuid from phase_7_first_commit), 'local-rule-and-facts',
  '{"reasonCodes":["same-event"],"ruleScore":85}'::jsonb, true, false, '[]'::jsonb,
  null, null, 'phase-7-v1', '2026-07-18 10:06:00+00'
) as result;
select is((select (result->>'clusterVersion')::integer from phase_7_second_commit), 2, 'meaningful update advances the shared cluster version once');
select ok((select is_sensitive from public.story_clusters where id = (select (result->>'clusterId')::uuid from phase_7_first_commit)), 'sensitive policy remains attached to the cluster');
select is((select (result->>'independentEvidenceUnits')::integer from phase_7_second_commit), 2, 'two independent publisher families count as two evidence units');
select is((select count(*)::integer from public.cluster_summaries where cluster_id = (select (result->>'clusterId')::uuid from phase_7_first_commit) and cluster_version = 2 and language = 'en'), 1, 'meaningful update queues a new English summary version');

update public.articles set next_processing_at = '2026-07-18 10:07:00+00' where id = '70000000-0000-4000-8000-000000000003';
create temporary table phase_7_third_claim as
select * from public.claim_articles('71000000-0000-4000-8000-000000000006', 1, 300, '2026-07-18 10:07:00+00');
select is((select count(*)::integer from phase_7_third_claim), 1, 'syndicated cross-source article is claimed');
select ok(public.stage_article_intelligence(
  '70000000-0000-4000-8000-000000000003', (select lease_token from phase_7_third_claim),
  '{"status":"ready","category":"government-schemes","topics":["grant"],"geography":{"countryCode":"IN","stateRegion":"Kerala","city":"Kochi"}}'::jsonb, 'phase-7-v1',
  '{"people":[],"organizations":["RBI"],"locations":["Kochi"]}'::jsonb, 'grant-announcement',
  '2026-07-18 09:00:00+00', 'opens grant', 'applications open',
  '[{"label":"grant","value":"10","unit":"crore","qualifier":null}]'::jsonb, '{}'::text[], 2::smallint,
  digest('phase7-event', 'sha256'), '{"fixture":true}'::jsonb
), 'syndicated article intelligence is staged');
create temporary table phase_7_third_commit as
select public.commit_article_to_story_cluster(
  '70000000-0000-4000-8000-000000000003', (select lease_token from phase_7_third_claim),
  (select (result->>'clusterId')::uuid from phase_7_first_commit), 'deterministic-event-consistency',
  '{"reasonCodes":["same-event"]}'::jsonb, false, false, '[]'::jsonb,
  '70000000-0000-4000-8000-000000000001', 'cross-source-exact', 'phase-7-v1', '2026-07-18 10:08:00+00'
) as result;
select is((select (result->>'independentEvidenceUnits')::integer from phase_7_third_commit), 2, 'syndicated wording does not create a third evidence unit');
select is((select evidence_duplicate_of_article_id from public.articles where id = '70000000-0000-4000-8000-000000000003'), '70000000-0000-4000-8000-000000000001'::uuid, 'cross-source duplicate provenance points to its evidence unit');

insert into public.articles (
  id, source_id, original_title, normalized_title, description, canonical_url,
  canonical_url_hash, normalized_title_hash, published_at, declared_language,
  country_code, state_region, city, processing_status, next_processing_at
) values (
  '70000000-0000-4000-8000-000000000007', (select news_id from phase_7_sources),
  'Uncorroborated legal allegation', 'uncorroborated legal allegation', 'A single report alleges legal wrongdoing.',
  'https://news.example/phase7-sensitive', digest('phase7-sensitive', 'sha256'), digest('phase7-sensitive-title', 'sha256'),
  '2026-07-18 10:10:00+00', 'en', 'IN', 'Delhi', 'Delhi', 'pending', '2026-07-18 10:20:00+00'
);
create temporary table phase_7_sensitive_claim as
select * from public.claim_articles('71000000-0000-4000-8000-000000000011', 1, 300, '2026-07-18 10:20:00+00');
select is((select article_id from phase_7_sensitive_claim), '70000000-0000-4000-8000-000000000007'::uuid, 'uncorroborated sensitive article is claimable for evaluation');
select ok(public.stage_article_intelligence(
  '70000000-0000-4000-8000-000000000007', (select lease_token from phase_7_sensitive_claim),
  '{"status":"ready","category":"politics","topics":["legal-case"],"geography":{"countryCode":"IN","stateRegion":"Delhi","city":"Delhi"}}'::jsonb, 'phase-7-v1',
  '{"people":["Fixture Person"],"organizations":[],"locations":["Delhi"]}'::jsonb, 'legal-allegation',
  '2026-07-18 10:10:00+00', 'alleges wrongdoing', null, '[]'::jsonb, array['legal', 'political'], 2::smallint,
  digest('phase7-sensitive-event', 'sha256'), '{"fixture":true}'::jsonb
), 'sensitive article intelligence is staged');
create temporary table phase_7_sensitive_commit as
select public.commit_article_to_story_cluster(
  '70000000-0000-4000-8000-000000000007', (select lease_token from phase_7_sensitive_claim), null,
  'deterministic-new-event', '{"reasonCodes":["new-sensitive-event"]}'::jsonb, false, false, '[]'::jsonb,
  null, null, 'phase-7-v1', '2026-07-18 10:21:00+00'
) as result;
select is((select result->>'clusterStatus' from phase_7_sensitive_commit), 'open', 'one sensitive publisher family cannot verify a cluster');
select is((select result->>'evidenceStrength' from phase_7_sensitive_commit), 'weak', 'uncorroborated sensitive evidence remains weak');
select is((select count(*)::integer from public.cluster_summaries where cluster_id = (select (result->>'clusterId')::uuid from phase_7_sensitive_commit)), 0, 'uncorroborated sensitive cluster queues no summary');
select is((select count(*)::integer from information_schema.tables where table_schema = 'public'), 23, 'later operational tables remain server-only public-schema tables');
select is((select count(*)::integer from pg_catalog.pg_policies where schemaname = 'public' and roles = array['service_role']::name[]), 23, 'every current table retains one forced-RLS service-role policy');

select * from finish();
rollback;
