begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;
select plan(61);

select ok(
  exists (
    select 1
    from pg_catalog.pg_enum as enum_value
    join pg_catalog.pg_type as enum_type on enum_type.oid = enum_value.enumtypid
    join pg_catalog.pg_namespace as namespace on namespace.oid = enum_type.typnamespace
    where namespace.nspname = 'public'
      and enum_type.typname = 'briefing_theme'
      and enum_value.enumlabel = 'midnight-brief'
  ),
  'Midnight Brief is an available briefing theme'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_enum as enum_value
    join pg_catalog.pg_type as enum_type on enum_type.oid = enum_value.enumtypid
    join pg_catalog.pg_namespace as namespace on namespace.oid = enum_type.typnamespace
    where namespace.nspname = 'public'
      and enum_type.typname = 'briefing_theme'
      and enum_value.enumlabel = 'amber-brief'
  ),
  'Amber Brief is an available briefing theme'
);

select ok(
  not exists (select 1 from pg_catalog.pg_extension where extname = 'vector'),
  'unused pgvector extension is removed by the rule-based clustering migration'
);

select is(
  (select count(*)::integer from information_schema.tables
   where table_schema = 'public' and table_name in (
     'subscribers', 'subscriber_preferences', 'subscriber_schedules', 'preference_versions',
     'email_verification_tokens', 'subscriber_sessions', 'admin_access_tokens', 'admin_sessions',
     'rate_limit_buckets', 'sources', 'articles', 'story_clusters', 'story_cluster_articles',
     'cluster_summaries', 'cluster_summary_articles', 'deliveries', 'delivery_stories',
     'admin_audit_log', 'alert_events', 'worker_heartbeats'
   )),
  20,
  'all Phase 2 tables exist'
);

select is(
  (select count(*)::integer from pg_catalog.pg_class as relation
   join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
   where namespace.nspname = 'public' and relation.relkind = 'r'
     and relation.relname in (
       'subscribers', 'subscriber_preferences', 'subscriber_schedules', 'preference_versions',
       'email_verification_tokens', 'subscriber_sessions', 'admin_access_tokens', 'admin_sessions',
       'rate_limit_buckets', 'sources', 'articles', 'story_clusters', 'story_cluster_articles',
       'cluster_summaries', 'cluster_summary_articles', 'deliveries', 'delivery_stories',
       'admin_audit_log', 'alert_events', 'worker_heartbeats'
     ) and relation.relrowsecurity and relation.relforcerowsecurity),
  20,
  'RLS is enabled and forced on every Phase 2 table'
);

select is(
  (select count(*)::integer from pg_catalog.pg_policies
   where schemaname = 'public' and roles = array['service_role']::name[]),
  23,
  'every current table has exactly one service-role policy'
);

select ok(not has_table_privilege('anon', 'public.subscribers', 'SELECT'), 'anon cannot read subscribers');
select ok(not has_table_privilege('authenticated', 'public.subscribers', 'SELECT'), 'authenticated cannot read subscribers');
select ok(has_table_privilege('service_role', 'public.subscribers', 'SELECT'), 'service role can read subscribers');
select is(
  (select count(*)::integer from information_schema.role_routine_grants
   where grantee in ('anon', 'authenticated') and routine_schema = 'public'),
  0,
  'browser roles cannot execute database functions'
);

-- Keep verification fixtures relative to one transaction-stable instant. This
-- preserves the full token lifetime without depending on the calendar date,
-- database timezone, or the wall-clock duration before this test starts.
create temporary table verification_test_clock as
select transaction_timestamp() as anchor_at;

create temporary table created_subscriber as
select * from public.create_pending_subscriber(
  'reader@example.com', 'Reader', 'IN', 'Kerala', 'Kochi', 'en',
  array['india', 'technology-ai']::public.news_category[],
  array['space']::text[], array['celebrity gossip']::text[], 3::smallint,
  'light-editorial', 'daily', null, '08:30'::time, 'Asia/Kolkata',
  '2026-07-12 10:00:00+00', '2026-07-12',
  (select anchor_at from verification_test_clock)
);

select is((select outcome from created_subscriber), 'created', 'pending subscriber is created atomically');
select is((select count(*)::integer from public.subscribers where email = 'reader@example.com'), 1, 'email has one row');

create temporary table duplicate_attempt as
select * from public.create_pending_subscriber(
  'reader@example.com', 'Attacker overwrite', 'IN', 'Delhi', null, 'hi',
  array['politics']::public.news_category[], '{}'::text[], '{}'::text[], 10::smallint,
  'dark-intelligence', 'weekly', 'monday', '09:00'::time, 'Asia/Kolkata',
  '2026-07-12 10:01:00+00', 'changed', '2026-07-12 10:01:00+00'
);

select is((select outcome from duplicate_attempt), 'existing-pending', 'duplicate signup returns existing state');
select is((select name from public.subscribers where email = 'reader@example.com'), 'Reader', 'duplicate signup does not overwrite identity');
select is(
  (select story_count::integer from public.subscriber_preferences
   where subscriber_id = (select subscriber_id from created_subscriber)),
  3,
  'duplicate signup does not overwrite preferences'
);

select lives_ok(
  format(
    'select * from public.issue_verification_token(%L::uuid, digest(''token-one'', ''sha256''), %L::timestamptz)',
    (select subscriber_id from created_subscriber),
    (select anchor_at + interval '1 second' from verification_test_clock)
  ),
  'first verification token is issued'
);
select lives_ok(
  format(
    'select * from public.issue_verification_token(%L::uuid, digest(''token-two'', ''sha256''), %L::timestamptz)',
    (select subscriber_id from created_subscriber),
    (select anchor_at + interval '2 seconds' from verification_test_clock)
  ),
  'new verification token atomically supersedes the old token'
);
select is(
  (select count(*)::integer from public.email_verification_tokens
   where subscriber_id = (select subscriber_id from created_subscriber) and status = 'active'),
  1,
  'only one verification token remains active'
);
select is(
  (select status::text from public.email_verification_tokens where token_hash = digest('token-one', 'sha256')),
  'invalidated',
  'older verification token is invalidated'
);
select ok(
  (select expires_at > statement_timestamp() + interval '23 hours'
   from public.email_verification_tokens
   where token_hash = digest('token-two', 'sha256')),
  'active verification token is safely unexpired relative to test execution'
);
select ok(
  (select is_valid from public.inspect_verification_token(
    digest('token-two', 'sha256'), statement_timestamp()
  )),
  'scanner-safe token inspection reports validity'
);
select is(
  (select status::text from public.email_verification_tokens where token_hash = digest('token-two', 'sha256')),
  'active',
  'inspection GET primitive does not consume the token'
);

select lives_ok(
  $$select * from public.consume_verification_token(digest('token-two', 'sha256'), statement_timestamp())$$,
  'deliberate verification consumes token and activates delivery'
);
select is(
  (select status::text from public.subscribers where id = (select subscriber_id from created_subscriber)),
  'active',
  'verified subscriber is active'
);
select ok(
  (select schedule.next_delivery_at > subscriber.verified_at
   from public.subscriber_schedules as schedule
   join public.subscribers as subscriber on subscriber.id = schedule.subscriber_id
   where schedule.subscriber_id = (select subscriber_id from created_subscriber)),
  'verification calculates a future UTC delivery'
);

select is(
  public.save_subscriber_preferences(
    (select subscriber_id from created_subscriber), 1, 'Reader Updated', 'IN', 'Karnataka',
    'Bengaluru', 'en', array['india', 'science']::public.news_category[],
    array['space']::text[], array['celebrity gossip']::text[], 4::smallint, 'light-editorial',
    'weekdays', null, '07:45'::time, 'Asia/Kolkata', '2026-07-12 10:10:00+00'
  ),
  2::bigint,
  'ordinary preference save increments the version atomically'
);
select is(
  (select count(*)::integer from public.preference_versions
   where subscriber_id = (select subscriber_id from created_subscriber) and version = 1),
  1,
  'ordinary save snapshots the previous version'
);
select throws_ok(
  format(
    $query$select public.save_subscriber_preferences(
      %L::uuid, 1, 'Stale overwrite', 'IN', 'Delhi', 'Delhi', 'en',
      array['world']::public.news_category[], '{}'::text[], '{}'::text[], 1::smallint,
      'light-editorial', 'daily', null, '08:00'::time, 'Asia/Kolkata',
      '2026-07-12 10:11:00+00'
    )$query$,
    (select subscriber_id from created_subscriber)
  ),
  '40001',
  'preference version conflict',
  'stale preference save fails closed'
);
select is(
  (select version from public.subscriber_preferences where subscriber_id = (select subscriber_id from created_subscriber)),
  2::bigint,
  'failed preference save leaves current version intact'
);
select is(
  public.save_subscriber_theme(
    (select subscriber_id from created_subscriber), 2, 'dark-intelligence', '2026-07-12 10:12:00+00'
  ),
  3::bigint,
  'immediate theme save is versioned and atomic'
);

select is(
  public.compute_next_delivery_at(
    '2026-03-08 06:55:00+00', 'daily', null, '02:30'::time, 'America/New_York'
  ),
  '2026-03-08 07:30:00+00'::timestamptz,
  'DST spring gap follows PostgreSQL timezone normalization deterministically'
);

update public.subscriber_schedules
set next_delivery_at = '2026-07-12 10:15:00+00'
where subscriber_id = (select subscriber_id from created_subscriber);

create temporary table scheduled_once as
select * from public.enqueue_due_deliveries(10, '2026-07-12 10:16:00+00');
create temporary table scheduled_twice as
select * from public.enqueue_due_deliveries(10, '2026-07-12 10:16:00+00');

select is((select count(*)::integer from scheduled_once), 1, 'scheduler creates one due delivery');
select is((select count(*)::integer from scheduled_twice), 0, 'overlapping scheduler call creates no duplicate');
select is(
  (select count(*)::integer from public.deliveries
   where subscriber_id = (select subscriber_id from created_subscriber)
     and scheduled_for = '2026-07-12 10:15:00+00'),
  1,
  'database idempotency key permits one row per subscriber and UTC slot'
);

-- Phase 8 inserts a deterministic selection stage before this original Phase
-- 2 rendering/send lease. This fixture has no stories by design, so mark its
-- empty selection snapshot ready before exercising the unchanged send states.
update public.deliveries
set personalization_status = 'ready', personalized_at = '2026-07-12 10:16:15+00',
    personalization_version = 'phase-8-test-fixture', actual_story_count = 0
where id = (select delivery_id from scheduled_once);

create temporary table delivery_claim as
select * from public.claim_deliveries(gen_random_uuid(), 10, 180, '2026-07-12 10:16:30+00');
create temporary table duplicate_claim as
select * from public.claim_deliveries(gen_random_uuid(), 10, 180, '2026-07-12 10:16:30+00');

select is((select count(*)::integer from delivery_claim), 1, 'delivery worker claims due work');
select is((select count(*)::integer from duplicate_claim), 0, 'another worker cannot claim an active lease');
select ok(
  not public.complete_delivery_send_with_receipt(
    (select delivery_id from delivery_claim), gen_random_uuid(), 'stale-fixture-receipt',
    '2026-07-12 10:17:00+00'
  ),
  'stale lease token cannot complete a delivery'
);

select ok(
  public.mark_delivery_rendered(
    (select delivery_id from delivery_claim), (select lease_token from delivery_claim), 0::smallint,
    '2026-07-12 10:17:00+00'
  )
  and public.begin_delivery_send(
    (select delivery_id from delivery_claim), (select lease_token from delivery_claim),
    '2026-07-12 10:17:01+00'
  )
  and public.complete_delivery_send_with_receipt(
    (select delivery_id from delivery_claim), (select lease_token from delivery_claim),
    'phase-2-fixture-receipt', '2026-07-12 10:17:02+00'
  ),
  'lease owner advances delivery through the guarded send state machine'
);

insert into public.story_clusters (
  status, category, evidence_strength, latest_event_at, verified_at, retention_until
) values (
  'verified', 'science', 'strong', '2026-07-12 09:00:00+00',
  '2026-07-12 09:30:00+00', '2026-08-11 09:30:00+00'
);

select ok(public.delete_subscriber((select subscriber_id from created_subscriber), '2026-07-12 11:00:00+00'), 'subscriber deletion succeeds');
select is(
  (select count(*)::integer
   from public.subscriber_preferences
   where subscriber_id = (select subscriber_id from created_subscriber)),
  0,
  'subscriber personal tables cascade immediately'
);
select is((select count(*)::integer from public.story_clusters), 1, 'shared public story data survives subscriber deletion');
select ok(
  exists (select 1 from public.admin_audit_log where action = 'subscriber-deleted' and target_subscriber_id is null),
  'deletion audit remains non-identifying'
);

-- Expiry is tested independently from supersession and consumption. The token
-- is issued from the same stable anchor, then evaluated well past its 24-hour
-- lifetime while the pending subscriber itself is still eligible.
create temporary table expired_token_subscriber as
select * from public.create_pending_subscriber(
  'expired-token@example.com', 'Expired Token', 'IN', 'Kerala', null, 'en',
  array['india']::public.news_category[], '{}'::text[], '{}'::text[], 3::smallint,
  'light-editorial', 'daily', null, '08:30'::time, 'Asia/Kolkata',
  '2026-07-12 10:00:00+00', '2026-07-12',
  (select anchor_at from verification_test_clock)
);
create temporary table expired_token_issued as
select * from public.issue_verification_token(
  (select subscriber_id from expired_token_subscriber),
  digest('expired-token', 'sha256'),
  (select anchor_at from verification_test_clock)
);

select is(
  (select is_valid from public.inspect_verification_token(
    digest('expired-token', 'sha256'),
    (select anchor_at + interval '25 hours' from verification_test_clock)
  )),
  false,
  'expired verification token inspection fails closed'
);
select throws_ok(
  format(
    'select * from public.consume_verification_token(digest(''expired-token'', ''sha256''), %L::timestamptz)',
    (select anchor_at + interval '25 hours' from verification_test_clock)
  ),
  '22023',
  'expired or superseded verification token',
  'expired verification token cannot be consumed'
);

insert into public.subscribers (
  email, name, consent_at, consent_version, unverified_expires_at
) values (
  'expired@example.com', 'Expired', '2026-06-01', '2026-07-12', '2026-06-08'
);
select ok(
  ((public.apply_retention('2026-07-12 12:00:00+00', 100))->>'unverifiedSubscribers')::integer = 1,
  'retention cleanup removes expired unverified subscribers in a bounded batch'
);

-- Launch-shape scheduler pressure: 100 subscribers become due together.
insert into public.subscribers (
  id, email, name, status, verified_at, consent_at, consent_version, unverified_expires_at
)
select gen_random_uuid(), 'bulk-' || value || '@example.com', 'Bulk ' || value, 'active',
       '2026-07-12 09:00:00+00', '2026-07-01 09:00:00+00', '2026-07-12',
       '2026-07-08 09:00:00+00'
from generate_series(1, 100) as value;

insert into public.subscriber_preferences (
  subscriber_id, country_code, state_region, language, categories, story_count, theme
)
select id, 'IN', 'Karnataka', 'en', array['india']::public.news_category[], 3, 'light-editorial'
from public.subscribers where email like 'bulk-%@example.com';

insert into public.subscriber_schedules (
  subscriber_id, frequency, local_delivery_time, timezone, next_delivery_at
)
select id, 'daily', '08:00'::time, 'Asia/Kolkata', '2026-07-12 12:30:00+00'
from public.subscribers where email like 'bulk-%@example.com';

create temporary table bulk_scheduled as
select * from public.enqueue_due_deliveries(200, '2026-07-12 12:31:00+00');
create temporary table bulk_duplicate_schedule as
select * from public.enqueue_due_deliveries(200, '2026-07-12 12:31:00+00');

select is((select count(*)::integer from bulk_scheduled), 100, '100 simultaneously due subscribers are scheduled');
select is((select count(*)::integer from bulk_duplicate_schedule), 0, 'repeated 100-subscriber scheduler call is idempotent');
select is(
  (select count(distinct (subscriber_id, scheduled_for))::integer from public.deliveries
   where subscriber_id in (select id from public.subscribers where email like 'bulk-%@example.com')),
  100,
  'all launch-shape delivery slots remain unique'
);

update public.deliveries
set personalization_status = 'ready', personalized_at = '2026-07-12 12:31:15+00',
    personalization_version = 'phase-8-test-fixture', actual_story_count = 0
where subscriber_id in (select id from public.subscribers where email like 'bulk-%@example.com');

create temporary table bulk_claim_one as
select * from public.claim_deliveries(gen_random_uuid(), 50, 180, '2026-07-12 12:31:30+00');
create temporary table bulk_claim_two as
select * from public.claim_deliveries(gen_random_uuid(), 50, 180, '2026-07-12 12:31:30+00');
create temporary table bulk_claim_three as
select * from public.claim_deliveries(gen_random_uuid(), 50, 180, '2026-07-12 12:31:30+00');

select is((select count(*)::integer from bulk_claim_one), 50, 'first delivery worker claims a bounded batch');
select is((select count(*)::integer from bulk_claim_two), 50, 'second delivery worker claims the remaining disjoint batch');
select is((select count(*)::integer from bulk_claim_three), 0, 'no delivery remains available for a third overlapping claim');

-- Source and article workers use the same lease-token ownership contract.
create temporary table claim_source as select gen_random_uuid() as id;
insert into public.sources (
  id, publisher_name, feed_name, feed_url, publisher_domain, language, reliability,
  role, terms_status, is_active, health, next_fetch_at
)
select id, 'Test Publisher', 'Test Feed', 'https://example.com/feed.xml', 'example.com',
       'en', 'tier-1', 'primary', 'approved', true, 'healthy', '2026-07-12 12:00:00+00'
from claim_source;

create temporary table source_claim_one as
select * from public.claim_due_sources(gen_random_uuid(), 10, 120, '2026-07-12 12:01:00+00');
create temporary table source_claim_two as
select * from public.claim_due_sources(gen_random_uuid(), 10, 120, '2026-07-12 12:01:00+00');
select is((select count(*)::integer from source_claim_one), 1, 'source worker claims a due feed');
select is((select count(*)::integer from source_claim_two), 0, 'another source worker cannot steal the active lease');
select ok(
  not public.finish_source_claim(
    (select source_id from source_claim_one), gen_random_uuid(), true,
    '2026-07-12 12:31:00+00', null, null, '2026-07-12 12:02:00+00'
  ),
  'stale source lease cannot complete work'
);
select ok(
  public.finish_source_claim(
    (select source_id from source_claim_one), (select lease_token from source_claim_one), true,
    '2026-07-12 12:31:00+00', 'etag-1', 'Sun, 12 Jul 2026 12:00:00 GMT',
    '2026-07-12 12:02:00+00'
  ),
  'source lease owner can complete work and release the lease'
);

create temporary table claim_article as select gen_random_uuid() as id;
insert into public.articles (
  id, source_id, original_title, normalized_title, canonical_url,
  canonical_url_hash, normalized_title_hash, published_at, next_processing_at
)
select id, (select id from claim_source), 'A test article', 'a test article',
       'https://example.com/article', digest('https://example.com/article', 'sha256'),
       digest('a test article', 'sha256'), '2026-07-12 11:00:00+00', '2026-07-12 12:00:00+00'
from claim_article;

create temporary table article_claim_one as
select * from public.claim_articles(gen_random_uuid(), 10, 180, '2026-07-12 12:03:00+00');
create temporary table article_claim_two as
select * from public.claim_articles(gen_random_uuid(), 10, 180, '2026-07-12 12:03:00+00');
select is((select count(*)::integer from article_claim_one), 1, 'article worker claims due processing');
select is((select count(*)::integer from article_claim_two), 0, 'another article worker cannot steal the active lease');
select ok(
  not public.finish_article_claim(
    (select article_id from article_claim_one), gen_random_uuid(), 'processed', null, null,
    '2026-07-12 12:04:00+00'
  ),
  'stale article lease cannot complete work'
);
select ok(
  public.finish_article_claim(
    (select article_id from article_claim_one), (select lease_token from article_claim_one),
    'processed', null, null, '2026-07-12 12:04:00+00'
  ),
  'article lease owner can complete work and release the lease'
);

-- Repeated transactional saves exercise version/snapshot integrity at the required scale.
create temporary table update_stress_subscriber as
select gen_random_uuid() as id;
insert into public.subscribers (
  id, email, name, status, verified_at, consent_at, consent_version, unverified_expires_at
)
select id, 'updates@example.com', 'Update Stress', 'active', '2026-07-12 09:00:00+00',
       '2026-07-01 09:00:00+00', '2026-07-12', '2026-07-08 09:00:00+00'
from update_stress_subscriber;
insert into public.subscriber_preferences (
  subscriber_id, country_code, state_region, language, categories, story_count, theme
)
select id, 'IN', 'Karnataka', 'en', array['science']::public.news_category[], 3, 'light-editorial'
from update_stress_subscriber;
insert into public.subscriber_schedules (
  subscriber_id, frequency, local_delivery_time, timezone, next_delivery_at
)
select id, 'daily', '08:00'::time, 'Asia/Kolkata', '2026-07-13 02:30:00+00'
from update_stress_subscriber;

do $$
declare
  expected_version bigint;
begin
  for expected_version in 1..1000 loop
    perform public.save_subscriber_preferences(
      (select id from update_stress_subscriber), expected_version, 'Update Stress', 'IN',
      'Karnataka', null, 'en', array['science']::public.news_category[], '{}'::text[],
      '{}'::text[], 3::smallint, 'light-editorial', 'daily', null, '08:00'::time,
      'Asia/Kolkata', '2026-07-12 13:00:00+00'::timestamptz + make_interval(secs => expected_version::integer)
    );
  end loop;
end;
$$;

select is(
  (select version from public.subscriber_preferences where subscriber_id = (select id from update_stress_subscriber)),
  1001::bigint,
  '1,000 transactional saves produce an exact monotonic preference version'
);
select is(
  (select count(*)::integer from public.preference_versions where subscriber_id = (select id from update_stress_subscriber)),
  1000,
  '1,000 transactional saves preserve every previous snapshot without loss'
);

select * from finish();
rollback;
