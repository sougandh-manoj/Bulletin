begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;
select plan(16);

select ok(
  to_regclass('public.email_verification_tokens') is null,
  'legacy email verification token storage is removed'
);
select ok(
  to_regclass('public.subscriber_sessions') is null,
  'legacy subscriber session storage is removed'
);
select is(
  (
    select count(*)::integer
    from pg_catalog.pg_proc as routine
    join pg_catalog.pg_namespace as namespace on namespace.oid = routine.pronamespace
    where namespace.nspname = 'public'
      and routine.proname in (
        'consume_verification_token_with_theme',
        'create_subscriber_session',
        'validate_subscriber_session',
        'revoke_subscriber_session',
        'issue_verification_token',
        'inspect_verification_token',
        'consume_verification_token',
        'invalidate_subscriber_access',
        'create_pending_subscriber'
      )
  ),
  0,
  'legacy verification and subscriber-session functions are removed'
);
select is(
  (
    select count(*)::integer
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'subscribers'
      and column_name in ('verification_generation', 'token_version', 'unverified_expires_at')
  ),
  0,
  'legacy subscriber authentication columns are removed'
);
select ok(
  to_regprocedure('public.find_authenticated_subscriber(uuid,text)') is not null,
  'authenticated subscriber lookup function exists'
);
select ok(
  to_regprocedure(
    'public.create_authenticated_subscriber(uuid,text,text,text,text,text,briefing_language,news_category[],text[],text[],smallint,briefing_theme,delivery_frequency,weekday,time without time zone,text,timestamp with time zone,text,timestamp with time zone)'
  ) is not null,
  'authenticated subscriber creation function exists'
);
select ok(
  not has_function_privilege('anon', 'public.find_authenticated_subscriber(uuid,text)', 'EXECUTE'),
  'browser anon role cannot look up authenticated subscribers directly'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.create_authenticated_subscriber(uuid,text,text,text,text,text,briefing_language,news_category[],text[],text[],smallint,briefing_theme,delivery_frequency,weekday,time without time zone,text,timestamp with time zone,text,timestamp with time zone)',
    'EXECUTE'
  ),
  'browser authenticated role cannot create subscribers directly'
);

create temporary table phase_4_identity as
select
  '10000000-0000-4000-8000-000000000004'::uuid as auth_user_id,
  '2026-07-31 06:00:00+00'::timestamptz as anchor_at;

create temporary table phase_4_created as
select *
from public.create_authenticated_subscriber(
  (select auth_user_id from phase_4_identity),
  'phase4@example.com',
  'Phase Four Reader',
  'IN',
  'Kerala',
  'Kochi',
  'en',
  array['india', 'technology-ai']::public.news_category[],
  array['space']::text[],
  array['celebrity gossip']::text[],
  8::smallint,
  'light-editorial',
  'daily',
  null,
  '08:30'::time,
  'Asia/Kolkata',
  '2026-07-31 05:59:00+00',
  '2026-07-31',
  (select anchor_at from phase_4_identity)
);

select is((select outcome from phase_4_created), 'created', 'social identity creates a subscriber');
select is(
  (select status::text from public.subscribers where id = (select subscriber_id from phase_4_created)),
  'active',
  'socially authenticated subscriber is active immediately'
);
select ok(
  (select verified_at is not null from public.subscribers where id = (select subscriber_id from phase_4_created)),
  'socially authenticated subscriber is verified immediately'
);
select is(
  (
    select auth_user_id
    from public.subscribers
    where id = (select subscriber_id from phase_4_created)
  ),
  (select auth_user_id from phase_4_identity),
  'subscriber is linked to the Supabase Auth user'
);
select ok(
  (
    select next_delivery_at > (select anchor_at from phase_4_identity)
    from public.subscriber_schedules
    where subscriber_id = (select subscriber_id from phase_4_created)
  ),
  'social signup calculates a future delivery'
);

create temporary table phase_4_found as
select *
from public.find_authenticated_subscriber(
  (select auth_user_id from phase_4_identity),
  'phase4@example.com'
);

select is((select outcome from phase_4_found), 'found-by-auth', 'subscriber lookup resolves by auth identity');

create temporary table phase_4_duplicate as
select *
from public.create_authenticated_subscriber(
  (select auth_user_id from phase_4_identity),
  'phase4@example.com',
  'Changed Name',
  'IN',
  'Delhi',
  null,
  'hi',
  array['politics']::public.news_category[],
  '{}'::text[],
  '{}'::text[],
  4::smallint,
  'dark-intelligence',
  'weekly',
  'monday',
  '09:00'::time,
  'Asia/Kolkata',
  '2026-07-31 06:01:00+00',
  'changed',
  '2026-07-31 06:01:00+00'
);

select is((select outcome from phase_4_duplicate), 'existing', 'repeat social signup returns the existing subscriber');
select is(
  (select count(*)::integer from public.subscribers where email = 'phase4@example.com'),
  1,
  'repeat social signup does not duplicate the email identity'
);

select * from finish();
rollback;
