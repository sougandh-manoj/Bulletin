begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;
select plan(12);

create temporary table retention_source as
select id from public.sources order by id limit 1;

insert into public.articles (
  id, source_id, original_title, normalized_title, canonical_url,
  canonical_url_hash, normalized_title_hash, published_at,
  processing_status, next_processing_at
) values
  ('a1000000-0000-4000-8000-000000000001', (select id from retention_source),
   'Expired retention article', 'expired retention article', 'https://retention.example/old',
   digest('retention-old-url','sha256'), digest('retention-old-title','sha256'),
   '2026-07-21 10:59:59+00', 'processed', '2026-07-21 11:00:00+00'),
  ('a1000000-0000-4000-8000-000000000002', (select id from retention_source),
   'Fresh retention article', 'fresh retention article', 'https://retention.example/fresh',
   digest('retention-fresh-url','sha256'), digest('retention-fresh-title','sha256'),
   '2026-07-23 11:00:01+00', 'processed', '2026-07-23 11:00:01+00');

insert into public.story_clusters (
  id, status, category, evidence_strength, latest_event_at, verified_at
) values
  ('c1000000-0000-4000-8000-000000000001', 'verified', 'india', 'sufficient',
   '2026-07-21 10:59:59+00', '2026-07-21 11:00:00+00'),
  ('c1000000-0000-4000-8000-000000000002', 'verified', 'india', 'sufficient',
   '2026-07-23 11:00:01+00', '2026-07-23 11:00:01+00');

insert into public.story_cluster_articles (
  cluster_id, article_id, decision, decision_method, added_in_version
) values
  ('c1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001',
   'accepted', 'retention-fixture', 1),
  ('c1000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000002',
   'accepted', 'retention-fixture', 1);

insert into public.cluster_summaries (
  id, cluster_id, cluster_version, language, status, attempt_count,
  next_attempt_at, last_error_code
) values
  ('b1000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001',
   1, 'en', 'retry-wait', 5, '2026-07-24 11:00:00+00', 'provider-rate-limited'),
  ('b1000000-0000-4000-8000-000000000002', 'c1000000-0000-4000-8000-000000000002',
   1, 'en', 'retry-wait', 5, '2026-07-24 11:00:00+00', 'local-verification-reserve'),
  ('b1000000-0000-4000-8000-000000000003', 'c1000000-0000-4000-8000-000000000002',
   2, 'hi', 'retry-wait', 5, '2026-07-24 11:00:00+00', 'summary-timeout');

create temporary table retention_result as
select public.apply_news_retention('2026-07-23 11:00:00+00', 100) as value;

select is((select count(*)::integer from public.articles where id='a1000000-0000-4000-8000-000000000001'),0,'article older than 48 hours is deleted');
select is((select count(*)::integer from public.story_clusters where id='c1000000-0000-4000-8000-000000000001'),0,'cluster older than 48 hours is deleted');
select is((select count(*)::integer from public.cluster_summaries where id='b1000000-0000-4000-8000-000000000001'),0,'expired cluster summary is removed by cascade');
select is((select count(*)::integer from public.articles where id='a1000000-0000-4000-8000-000000000002'),1,'fresh article is retained');
select is((select count(*)::integer from public.story_clusters where id='c1000000-0000-4000-8000-000000000002'),1,'fresh cluster is retained');
select is((select status::text||':'||attempt_count from public.cluster_summaries where id='b1000000-0000-4000-8000-000000000002'),'retry-wait:0','capacity-deferred retry is reset without being falsely finalized');
select is((select status::text from public.cluster_summaries where id='b1000000-0000-4000-8000-000000000003'),'failed','genuinely exhausted retry is finalized');
select is((select last_error_code from public.cluster_summaries where id='b1000000-0000-4000-8000-000000000003'),'retry-exhausted-summary-timeout','finalized retry retains a safe reason');
select is(((select value from retention_result)->>'deletedArticles')::integer,1,'cleanup reports deleted article count');
select is(((select value from retention_result)->>'deletedClusters')::integer,1,'cleanup reports deleted cluster count');

update public.cluster_summaries
set status='generating', attempt_count=3, last_error_code=null,
    lease_token=gen_random_uuid(), lease_owner=gen_random_uuid(),
    lease_expires_at='2026-07-23 11:10:00+00'
where id='b1000000-0000-4000-8000-000000000002';
update public.cluster_summaries
set status='retry-wait', last_error_code='provider-rate-limited',
    next_attempt_at='2026-07-23 11:15:00+00',
    lease_token=null, lease_owner=null, lease_expires_at=null
where id='b1000000-0000-4000-8000-000000000002';
select is((select attempt_count::integer from public.cluster_summaries where id='b1000000-0000-4000-8000-000000000002'),2,'future provider deferral does not consume a generation attempt');
select ok(not has_function_privilege('anon','public.apply_news_retention(timestamptz,integer)','EXECUTE'),'browser roles cannot run retention cleanup');

select * from finish();
rollback;
