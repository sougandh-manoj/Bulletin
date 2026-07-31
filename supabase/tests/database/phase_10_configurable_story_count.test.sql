begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;
select plan(6);

insert into public.subscribers (
  id, email, name, status, verified_at, consent_at, consent_version
) values (
  'ac000000-0000-4000-8000-000000000001',
  'configurable-count@example.invalid',
  'Configurable Count',
  'active',
  '2026-07-24 00:00+00',
  '2026-07-24 00:00+00',
  '2026-07-12'
);

select lives_ok(
  $$insert into public.subscriber_preferences (
    subscriber_id, country_code, state_region, language, categories, story_count
  ) values (
    'ac000000-0000-4000-8000-000000000001', 'IN', 'Kerala', 'en',
    array['india','sports']::public.news_category[], 4
  )$$,
  'two stories per category is accepted'
);
select lives_ok(
  $$update public.subscriber_preferences set story_count=12
    where subscriber_id='ac000000-0000-4000-8000-000000000001'$$,
  'six stories per category is accepted'
);
select throws_ok(
  $$update public.subscriber_preferences set story_count=2
    where subscriber_id='ac000000-0000-4000-8000-000000000001'$$,
  '23514',
  'new row for relation "subscriber_preferences" violates check constraint "subscriber_preferences_story_count_check"',
  'fewer than two stories per category is rejected'
);
select throws_ok(
  $$update public.subscriber_preferences set story_count=14
    where subscriber_id='ac000000-0000-4000-8000-000000000001'$$,
  '23514',
  'new row for relation "subscriber_preferences" violates check constraint "subscriber_preferences_story_count_check"',
  'more than six stories per category is rejected'
);
select lives_ok(
  $$update public.subscriber_preferences set story_count=8
    where subscriber_id='ac000000-0000-4000-8000-000000000001'$$,
  'equal per-category totals remain accepted'
);
select ok(
  position('48' in pg_get_constraintdef(
    (select oid from pg_constraint
     where conrelid='public.deliveries'::regclass
       and conname='deliveries_story_count_check')
  )) > 0,
  'delivery rows allow the eight-category maximum of 48 stories'
);

select * from finish();
rollback;
