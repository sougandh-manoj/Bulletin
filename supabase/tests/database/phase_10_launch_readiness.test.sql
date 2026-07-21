begin;
create extension if not exists pgtap with schema extensions;
select extensions.plan(8);

select extensions.is(
  (select email_delivery_enabled from public.system_controls where singleton),
  false,
  'fresh production bootstrap disables real email'
);
select extensions.ok(
  (select delivery_worker_paused and personalization_worker_paused
      and ingestion_worker_paused and intelligence_worker_paused
   from public.system_controls where singleton),
  'fresh production bootstrap pauses every worker stage'
);
select extensions.is(
  (select count(*)::integer from public.sources where is_active),
  48,
  'only the approved active source catalogue is seeded'
);
select extensions.ok(
  (select max(next_fetch_at) - min(next_fetch_at) <= interval '29 minutes'
      and min(next_fetch_at) is not null
   from public.sources where is_active),
  'initial active source fetches are bounded and staggered across thirty minutes'
);

insert into public.articles (
  id, source_id, original_title, normalized_title, description,
  canonical_url, canonical_url_hash, normalized_title_hash, published_at,
  declared_language, processing_status, next_processing_at
)
select 'a0000000-0000-4000-8000-000000000001', id,
  'Old production bootstrap fixture', 'old production bootstrap fixture', 'Old fixture.',
  'https://fixture.invalid/phase10-old', decode(repeat('a1', 32), 'hex'), decode(repeat('a2', 32), 'hex'),
  '2099-07-16 00:00:00+00', 'en', 'pending', '2099-07-19 00:00:00+00'
from public.sources order by id limit 1;

insert into public.articles (
  id, source_id, original_title, normalized_title, description,
  canonical_url, canonical_url_hash, normalized_title_hash, published_at,
  declared_language, processing_status, next_processing_at
)
select 'a0000000-0000-4000-8000-000000000002', id,
  'Fresh production bootstrap fixture', 'fresh production bootstrap fixture', 'Fresh fixture.',
  'https://fixture.invalid/phase10-fresh', decode(repeat('b1', 32), 'hex'), decode(repeat('b2', 32), 'hex'),
  '2099-07-19 01:00:00+00', 'en', 'pending', '2099-07-19 00:00:00+00'
from public.sources order by id limit 1;

select extensions.is(
  (select count(*)::integer from public.claim_articles(
    'a0000000-0000-4000-8000-000000000010', 10, 180, '2099-07-19 02:00:00+00'
  )),
  0,
  'paused intelligence worker cannot claim fresh work'
);

update public.system_controls set intelligence_worker_paused = false where singleton;

select extensions.is(
  (select article_id from public.claim_articles(
    'a0000000-0000-4000-8000-000000000010', 10, 180, '2099-07-19 02:00:00+00'
  )),
  'a0000000-0000-4000-8000-000000000002'::uuid,
  'only the newest eligible article is claimed'
);
select extensions.is(
  (select processing_status::text from public.articles where id = 'a0000000-0000-4000-8000-000000000001'),
  'quarantined',
  'uncompleted articles older than forty-eight hours are quarantined'
);
select extensions.is(
  (select last_error_code from public.articles where id = 'a0000000-0000-4000-8000-000000000001'),
  'stale-article',
  'stale quarantine remains visible to operations'
);

select * from extensions.finish();
rollback;
