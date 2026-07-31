begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;
select plan(40);

update public.system_controls set personalization_worker_paused = false where singleton;

select ok(exists(
  select 1 from pg_catalog.pg_enum enum_value
  join pg_catalog.pg_type enum_type on enum_type.oid = enum_value.enumtypid
  where enum_type.typname = 'personalization_status' and enum_value.enumlabel = 'ready'
), 'personalization has an explicit ready state');
select ok(not has_function_privilege(
  'anon', 'public.claim_delivery_personalizations(uuid,integer,integer,timestamptz)', 'EXECUTE'
), 'anon cannot claim personalization work');
select ok(not has_function_privilege(
  'authenticated', 'public.load_delivery_personalization_context(uuid,uuid)', 'EXECUTE'
), 'authenticated users cannot read another subscriber personalization context');
select ok(has_function_privilege(
  'service_role', 'public.complete_delivery_personalization(uuid,uuid,jsonb,text,jsonb,timestamptz)', 'EXECUTE'
), 'service role can atomically store a reviewed selection snapshot');
create temporary table phase_8_provider_usage_before as
select count(*)::integer as usage_count from bulletin_private.ai_provider_usage_windows;

select is(public.compute_delivery_window_start(
  '2026-07-19 02:30:00+00', 'daily', null, '08:00'::time, 'Asia/Kolkata'
), '2026-07-18 02:30:00+00'::timestamptz, 'daily window follows the previous local delivery');
select is(public.compute_delivery_window_start(
  '2026-07-20 02:30:00+00', 'weekdays', null, '08:00'::time, 'Asia/Kolkata'
), '2026-07-17 02:30:00+00'::timestamptz, 'Monday weekday window includes the weekend gap');
select is(public.compute_delivery_window_start(
  '2026-07-18 02:30:00+00', 'weekends', null, '08:00'::time, 'Asia/Kolkata'
), '2026-07-12 02:30:00+00'::timestamptz, 'Saturday weekend window follows the previous weekend delivery');
select is(public.compute_delivery_window_start(
  '2026-07-20 02:30:00+00', 'weekly', 'monday', '08:00'::time, 'Asia/Kolkata'
), '2026-07-13 02:30:00+00'::timestamptz, 'weekly window is bounded to the previous selected weekday');
select is(public.compute_delivery_window_start(
  '2026-03-09 06:30:00+00', 'daily', null, '02:30'::time, 'America/New_York'
), '2026-03-08 07:30:00+00'::timestamptz, 'spring-forward missing local time normalizes deterministically');
select is(public.compute_delivery_window_start(
  '2026-11-02 06:30:00+00', 'daily', null, '01:30'::time, 'America/New_York'
), '2026-11-01 06:30:00+00'::timestamptz, 'fall-back repeated local time uses one deterministic UTC instant');

insert into public.subscribers (
  id, email, name, status, verified_at, consent_at, consent_version
) values (
  '80000000-0000-4000-8000-000000000001', 'phase8-reader@example.com', 'Phase Eight Reader',
  'active', '2026-07-19 00:00:00+00', '2026-07-01 00:00:00+00', '2026-07-12'
);
insert into public.subscriber_preferences (
  subscriber_id, country_code, state_region, city, language, categories,
  custom_topics, excluded_topics, story_count, theme
) values (
  '80000000-0000-4000-8000-000000000001', 'IN', 'Kerala', 'Kochi', 'en',
  array['technology-ai']::public.news_category[], array['solar energy'],
  array['celebrity gossip'], 4, 'light-editorial'
);
insert into public.subscriber_schedules (
  subscriber_id, frequency, local_delivery_time, timezone, next_delivery_at
) values (
  '80000000-0000-4000-8000-000000000001', 'weekdays', '08:00'::time,
  'Asia/Kolkata', '2026-07-20 02:30:00+00'
);

create temporary table phase_8_scheduled_once as
select * from public.enqueue_due_deliveries(10, '2026-07-20 02:31:00+00');
create temporary table phase_8_scheduled_twice as
select * from public.enqueue_due_deliveries(10, '2026-07-20 02:31:00+00');
select is((select count(*)::integer from phase_8_scheduled_once), 1, 'due active verified subscriber creates one delivery');
select is((select count(*)::integer from phase_8_scheduled_twice), 0, 'request retry creates no duplicate delivery');
select is((select count(*)::integer from public.deliveries
  where subscriber_id = '80000000-0000-4000-8000-000000000001'
    and scheduled_for = '2026-07-20 02:30:00+00'), 1, 'database slot idempotency remains structural');
select is((select news_window_started_at from public.deliveries
  where id = (select delivery_id from phase_8_scheduled_once)),
  '2026-07-17 02:30:00+00'::timestamptz, 'delivery stores its exact Monday news-window start');
select is((select next_delivery_at from public.subscriber_schedules
  where subscriber_id = '80000000-0000-4000-8000-000000000001'),
  '2026-07-21 02:30:00+00'::timestamptz, 'next UTC slot advances in the delivery transaction');
select is((select count(*)::integer from public.claim_deliveries(
  '81000000-0000-4000-8000-000000000009', 10, 180, '2026-07-20 02:31:15+00'
)), 0, 'Phase 9 delivery lease cannot overtake an unfinished personalization snapshot');

create temporary table phase_8_claim_one as
select * from public.claim_delivery_personalizations(
  '81000000-0000-4000-8000-000000000001', 1, 180, '2026-07-20 02:31:30+00'
);
create temporary table phase_8_claim_overlap as
select * from public.claim_delivery_personalizations(
  '81000000-0000-4000-8000-000000000002', 1, 180, '2026-07-20 02:31:30+00'
);
select is((select count(*)::integer from phase_8_claim_one), 1, 'one worker claims the pending personalization lease');
select is((select count(*)::integer from phase_8_claim_overlap), 0, 'overlapping worker cannot steal an active lease');
update public.deliveries set personalization_lease_expires_at = '2026-07-20 02:31:00+00'
where id = (select delivery_id from phase_8_claim_one);
create temporary table phase_8_reclaim as
select * from public.claim_delivery_personalizations(
  '81000000-0000-4000-8000-000000000003', 1, 180, '2026-07-20 02:32:00+00'
);
select is((select count(*)::integer from phase_8_reclaim), 1, 'expired personalization lease is reclaimable');
select isnt((select lease_token from phase_8_reclaim), (select lease_token from phase_8_claim_one), 'recovery replaces the stale lease token');

create temporary table phase_8_source as
select id from public.sources where reliability = 'tier-1' and not is_aggregator order by id limit 1;
insert into public.articles (
  id, source_id, original_title, normalized_title, description, canonical_url,
  canonical_url_hash, normalized_title_hash, published_at, declared_language,
  country_code, processing_status, processed_at, factual_depth, next_processing_at
) values
  ('82000000-0000-4000-8000-000000000001', (select id from phase_8_source),
   'Verified national AI development', 'verified national ai development', 'Supported facts for the briefing.',
   'https://phase8.example/ai', digest('phase8-ai', 'sha256'), digest('phase8-ai-title', 'sha256'),
   '2026-07-19 22:00:00+00', 'en', 'IN', 'processed', '2026-07-19 23:00:00+00', 3, '2026-07-19 23:00:00+00'),
  ('82000000-0000-4000-8000-000000000002', (select id from phase_8_source),
   'Verified solar development', 'verified solar development', 'Supported solar facts for the briefing.',
   'https://phase8.example/solar', digest('phase8-solar', 'sha256'), digest('phase8-solar-title', 'sha256'),
   '2026-07-19 21:00:00+00', 'en', 'IN', 'processed', '2026-07-19 23:00:00+00', 3, '2026-07-19 23:00:00+00');

insert into public.story_clusters (
  id, public_reference, status, category, country_code, state_region, city,
  central_topics, entities, evidence_strength, current_version, latest_event_at,
  verified_at, evidence_independence_count, evidence_result, conflict_details,
  event_type, verification_version
) values
  ('83000000-0000-4000-8000-000000000001', '84000000-0000-4000-8000-000000000001',
   'verified', 'technology-ai', 'IN', null, null, array['artificial intelligence'],
   '{"organizations":["India AI Mission"]}', 'strong', 1, '2026-07-19 22:00:00+00',
   '2026-07-19 23:00:00+00', 2, '{"policyVersion":"phase-7-v1"}', '[]',
   'policy-announcement', 'phase-7-v1'),
  ('83000000-0000-4000-8000-000000000002', '84000000-0000-4000-8000-000000000002',
   'verified', 'climate', 'IN', 'Kerala', null, array['solar energy'],
   '{"organizations":["Solar Mission"]}', 'sufficient', 1, '2026-07-19 21:00:00+00',
   '2026-07-19 23:00:00+00', 1, '{"policyVersion":"phase-7-v1"}', '[]',
   'energy-announcement', 'phase-7-v1'),
  ('83000000-0000-4000-8000-000000000003', '84000000-0000-4000-8000-000000000003',
   'quarantined', 'technology-ai', 'IN', null, null, array['unsafe topic'], '{}',
   'weak', 1, '2026-07-19 20:00:00+00', null, 0, '{}', '[]', null, null),
  ('83000000-0000-4000-8000-000000000004', '84000000-0000-4000-8000-000000000004',
   'verified', 'technology-ai', 'IN', null, null, array['old topic'], '{}',
   'strong', 1, '2026-07-16 20:00:00+00', '2026-07-16 21:00:00+00', 2, '{}', '[]', null, 'phase-7-v1');

insert into public.story_cluster_articles (
  cluster_id, article_id, decision, decision_method, added_in_version
) values
  ('83000000-0000-4000-8000-000000000001', '82000000-0000-4000-8000-000000000001', 'accepted', 'phase-8-fixture', 1),
  ('83000000-0000-4000-8000-000000000002', '82000000-0000-4000-8000-000000000002', 'accepted', 'phase-8-fixture', 1);

insert into public.cluster_summaries (
  id, cluster_id, cluster_version, language, status, headline, summary, why_it_matters,
  verification_result, prompt_version, schema_version, provider, model, model_metadata,
  verified_at, source_references, verification_version
) values
  ('85000000-0000-4000-8000-000000000001', '83000000-0000-4000-8000-000000000001', 1, 'en', 'verified',
   'Verified national AI development', 'One supported fact. A second supported fact. A third supported fact.',
   'This matters for technology policy.', '{"passed":true}', 'phase-7-v1', 'phase-7-v1',
   'fixture', 'fixture-model', '{"fixture":true}', '2026-07-19 23:00:00+00', '[]', 'phase-7-v1'),
  ('85000000-0000-4000-8000-000000000002', '83000000-0000-4000-8000-000000000002', 1, 'en', 'verified',
   'Verified solar development', 'One supported fact. A second supported fact. A third supported fact.',
   'This matters for clean energy.', '{"passed":true}', 'phase-7-v1', 'phase-7-v1',
   'fixture', 'fixture-model', '{"fixture":true}', '2026-07-19 23:00:00+00', '[]', 'phase-7-v1'),
  ('85000000-0000-4000-8000-000000000004', '83000000-0000-4000-8000-000000000004', 1, 'en', 'verified',
   'Old verified story', 'One supported fact. A second supported fact. A third supported fact.',
   'This old item is outside the window.', '{"passed":true}', 'phase-7-v1', 'phase-7-v1',
   'fixture', 'fixture-model', '{"fixture":true}', '2026-07-16 21:00:00+00', '[]', 'phase-7-v1');

select is((public.load_delivery_personalization_context(
  (select delivery_id from phase_8_reclaim), (select lease_token from phase_8_reclaim)
)->>'language'), 'en', 'lease owner loads the server-only preference context');
create temporary table phase_8_candidates as
select * from public.list_delivery_personalization_candidates(
  (select delivery_id from phase_8_reclaim), (select lease_token from phase_8_reclaim), 200
);
select is((select count(*)::integer from phase_8_candidates), 2, 'only verified non-conflicted in-window canonical versions are candidates');
select ok(not exists(select 1 from phase_8_candidates where cluster_id in (
  '83000000-0000-4000-8000-000000000003', '83000000-0000-4000-8000-000000000004'
)), 'quarantined and out-of-window clusters are excluded by the database boundary');

select ok(public.complete_delivery_personalization(
  (select delivery_id from phase_8_reclaim), (select lease_token from phase_8_reclaim),
  jsonb_build_array(
    jsonb_build_object('position',1,'clusterId','83000000-0000-4000-8000-000000000001',
      'clusterPublicReference','84000000-0000-4000-8000-000000000001','clusterVersion',1,
      'summaryId','85000000-0000-4000-8000-000000000001','score',80.5,
      'reasons',jsonb_build_object('selectedCategory',true),'subjectKey','artificial intelligence'),
    jsonb_build_object('position',2,'clusterId','83000000-0000-4000-8000-000000000002',
      'clusterPublicReference','84000000-0000-4000-8000-000000000002','clusterVersion',1,
      'summaryId','85000000-0000-4000-8000-000000000002','score',71.25,
      'reasons',jsonb_build_object('customTopicMatches',jsonb_build_array('solar energy')),'subjectKey','solar energy')
  ), 'phase-8-rules-v1', '{"candidateCount":2,"selectedCount":2}', '2026-07-20 02:33:00+00'
), 'lease owner atomically stores the ordered exact cluster versions');
select is((select personalization_status::text || ':' || actual_story_count from public.deliveries
  where id = (select delivery_id from phase_8_reclaim)), 'ready:2', 'delivery becomes ready with the exact selected count');
select is((select string_agg(cluster_public_reference::text, ',' order by position) from public.delivery_stories
  where delivery_id = (select delivery_id from phase_8_reclaim)),
  '84000000-0000-4000-8000-000000000001,84000000-0000-4000-8000-000000000002',
  'ordered delivery-story rows preserve the final ranking');
select ok((select bool_and(selection_score > 0 and subject_key <> 'unspecified'
  and jsonb_typeof(selection_reasons) = 'object') from public.delivery_stories
  where delivery_id = (select delivery_id from phase_8_reclaim)), 'selection scores, reasons, and subject audit keys are stored');

insert into public.deliveries (
  id, subscriber_id, scheduled_for, preference_version, language, theme,
  news_window_started_at, news_window_ended_at, next_personalization_at
) values (
  '86000000-0000-4000-8000-000000000001', '80000000-0000-4000-8000-000000000001',
  '2026-07-21 02:30:00+00', 1, 'en', 'light-editorial',
  '2026-07-20 02:30:00+00', '2026-07-21 02:30:00+00', '2026-07-21 02:31:00+00'
);
update public.story_clusters set latest_event_at = '2026-07-20 22:00:00+00'
where id = '83000000-0000-4000-8000-000000000001';
create temporary table phase_8_second_claim as
select * from public.claim_delivery_personalizations(
  '81000000-0000-4000-8000-000000000004', 1, 180, '2026-07-21 02:31:00+00'
);
create temporary table phase_8_repeat_candidates as
select * from public.list_delivery_personalization_candidates(
  (select delivery_id from phase_8_second_claim), (select lease_token from phase_8_second_claim), 200
);
select is((select previous_delivered_version from phase_8_repeat_candidates
  where cluster_id = '83000000-0000-4000-8000-000000000001'), 1, 'candidate query exposes exact repeat-suppression history');
select throws_ok(format(
  $q$select public.complete_delivery_personalization(%L::uuid,%L::uuid,
    '[{"position":1,"clusterId":"83000000-0000-4000-8000-000000000001","clusterPublicReference":"84000000-0000-4000-8000-000000000001","clusterVersion":1,"summaryId":"85000000-0000-4000-8000-000000000001","score":80,"reasons":{},"subjectKey":"ai"}]'::jsonb,
    'phase-8-rules-v1','{}'::jsonb,'2026-07-21 02:32:00+00')$q$,
  (select delivery_id from phase_8_second_claim), (select lease_token from phase_8_second_claim)
), '55000', 'story version was already delivered', 'database rejects an already-delivered version even if a worker is stale');

update public.story_clusters set current_version = 2, latest_event_at = '2026-07-20 23:00:00+00'
where id = '83000000-0000-4000-8000-000000000001';
insert into public.cluster_summaries (
  id, cluster_id, cluster_version, language, status, headline, summary, why_it_matters,
  verification_result, prompt_version, schema_version, provider, model, model_metadata,
  verified_at, source_references, verification_version
) values (
  '85000000-0000-4000-8000-000000000003', '83000000-0000-4000-8000-000000000001', 2, 'en', 'verified',
  'Meaningful AI policy update', 'One updated fact. A second updated fact. A third updated fact.',
  'The factual development changes the story.', '{"passed":true}', 'phase-7-v1', 'phase-7-v1',
  'fixture', 'fixture-model', '{"fixture":true}', '2026-07-20 23:30:00+00', '[]', 'phase-7-v1'
);
create temporary table phase_8_update_candidates as
select * from public.list_delivery_personalization_candidates(
  (select delivery_id from phase_8_second_claim), (select lease_token from phase_8_second_claim), 200
);
select is((select cluster_version || ':' || previous_delivered_version from phase_8_update_candidates
  where cluster_id = '83000000-0000-4000-8000-000000000001'), '2:1', 'meaningful newer version remains eligible against older history');
select ok(public.complete_delivery_personalization(
  (select delivery_id from phase_8_second_claim), (select lease_token from phase_8_second_claim),
  '[{"position":1,"clusterId":"83000000-0000-4000-8000-000000000001","clusterPublicReference":"84000000-0000-4000-8000-000000000001","clusterVersion":2,"summaryId":"85000000-0000-4000-8000-000000000003","score":90,"reasons":{"meaningfulUpdate":true},"subjectKey":"artificial intelligence"}]'::jsonb,
  'phase-8-rules-v1', '{"selectedCount":1}', '2026-07-21 02:33:00+00'
), 'meaningful update version can be stored after the earlier version');
select ok((select is_update from public.delivery_stories
  where delivery_id = '86000000-0000-4000-8000-000000000001'), 'newer version is durably labeled as an update');

insert into public.subscribers (
  id, email, name, status, verified_at, consent_at, consent_version
) values (
  '80000000-0000-4000-8000-000000000002', 'phase8-hindi@example.com', 'Hindi Reader',
  'active', '2026-07-20', '2026-07-01', '2026-07-12'
);
insert into public.subscriber_preferences (
  subscriber_id, country_code, state_region, language, categories, story_count, theme
) values (
  '80000000-0000-4000-8000-000000000002', 'IN', 'Kerala', 'hi',
  array['technology-ai']::public.news_category[], 4, 'light-editorial'
);
insert into public.subscriber_schedules (
  subscriber_id, frequency, local_delivery_time, timezone, next_delivery_at
) values ('80000000-0000-4000-8000-000000000002', 'daily', '08:00', 'Asia/Kolkata', '2026-07-21 02:30:00+00');
insert into public.deliveries (
  id, subscriber_id, scheduled_for, preference_version, language, theme,
  news_window_started_at, news_window_ended_at, next_personalization_at
) values (
  '86000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000002',
  '2026-07-21 02:30:00+00', 1, 'hi', 'light-editorial',
  '2026-07-20 02:30:00+00', '2026-07-21 02:30:00+00', '2026-07-21 02:31:00+00'
);
create temporary table phase_8_hindi_claim as select * from public.claim_delivery_personalizations(
  '81000000-0000-4000-8000-000000000005', 1, 180, '2026-07-21 02:31:00+00'
);
create temporary table phase_8_hindi_candidates as select * from public.list_delivery_personalization_candidates(
  (select delivery_id from phase_8_hindi_claim), (select lease_token from phase_8_hindi_claim), 200
);
select is((select summary_available from phase_8_hindi_candidates
  where cluster_id = '83000000-0000-4000-8000-000000000001'), false, 'missing Hindi localization is never treated as selectable inventory');
create temporary table phase_8_localization_ids as
select public.enqueue_cluster_localization('83000000-0000-4000-8000-000000000001', 2, 'hi', '2026-07-21 02:32:00+00') as first_id,
       public.enqueue_cluster_localization('83000000-0000-4000-8000-000000000001', 2, 'hi', '2026-07-21 02:32:01+00') as second_id;
select is((select first_id from phase_8_localization_ids), (select second_id from phase_8_localization_ids), 'missing localization enqueue is idempotent and shared');
select is((select count(*)::integer from public.cluster_summaries
  where cluster_id = '83000000-0000-4000-8000-000000000001'
    and cluster_version = 2 and language = 'hi'), 1, 'one shared localization job exists for all subscribers');

insert into public.subscribers (
  id, email, name, status, verified_at, consent_at, consent_version
) values (
  '80000000-0000-4000-8000-000000000003', 'phase8-invalid-timezone@example.com', 'Invalid Zone',
  'active', '2026-07-20', '2026-07-01', '2026-07-12'
);
insert into public.subscriber_preferences (
  subscriber_id, country_code, state_region, language, categories, story_count, theme
) values (
  '80000000-0000-4000-8000-000000000003', 'IN', 'Kerala', 'en',
  array['india']::public.news_category[], 4, 'light-editorial'
);
insert into public.subscriber_schedules (
  subscriber_id, frequency, local_delivery_time, timezone, next_delivery_at
) values (
  '80000000-0000-4000-8000-000000000003', 'daily', '08:00', 'Invalid/Changed_Zone',
  '2026-07-21 02:30:00+00'
);
select is((select count(*)::integer from public.enqueue_due_deliveries(10, '2026-07-21 02:31:00+00')
  where subscriber_id = '80000000-0000-4000-8000-000000000003'), 0, 'invalid timezone cannot create a delivery');
select is((select schedule_error_code from public.subscriber_schedules
  where subscriber_id = '80000000-0000-4000-8000-000000000003'), 'invalid-schedule-data', 'invalid stored timezone fails visibly without blocking the batch');

insert into public.deliveries (
  id, subscriber_id, scheduled_for, preference_version, language, theme,
  news_window_started_at, news_window_ended_at, next_personalization_at
) values
  ('86000000-0000-4000-8000-000000000003', '80000000-0000-4000-8000-000000000001',
   '2026-07-22 02:30:00+00', 1, 'en', 'light-editorial', '2026-07-21 02:30:00+00', '2026-07-22 02:30:00+00', '2026-07-22 02:31:00+00'),
  ('86000000-0000-4000-8000-000000000004', '80000000-0000-4000-8000-000000000001',
   '2026-07-23 02:30:00+00', 1, 'en', 'light-editorial', '2026-07-22 02:30:00+00', '2026-07-23 02:30:00+00', '2026-07-23 02:31:00+00');
create temporary table phase_8_parallel_one as select * from public.claim_delivery_personalizations(
  '81000000-0000-4000-8000-000000000006', 1, 180, '2026-07-23 02:31:00+00'
);
create temporary table phase_8_parallel_two as select * from public.claim_delivery_personalizations(
  '81000000-0000-4000-8000-000000000007', 1, 180, '2026-07-23 02:31:00+00'
);
select isnt((select delivery_id from phase_8_parallel_one), (select delivery_id from phase_8_parallel_two), 'concurrent workers receive disjoint pending deliveries');
select ok(not public.fail_delivery_personalization_claim(
  (select delivery_id from phase_8_parallel_one), gen_random_uuid(), '2026-07-23 02:40:00+00',
  'stale-worker', false, '2026-07-23 02:32:00+00'
), 'stale worker token cannot mutate another personalization lease');
select is((select count(*)::integer from bulletin_private.ai_provider_usage_windows),
  (select usage_count from phase_8_provider_usage_before), 'personalization and scheduling consume no AI provider quota');

select * from finish();
rollback;
