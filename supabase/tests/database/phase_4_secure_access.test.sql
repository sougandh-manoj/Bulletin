begin;

create extension if not exists pgtap with schema extensions;
select plan(15);

select has_function(
  'public',
  'create_subscriber_session',
  array['uuid', 'bytea', 'bytea', 'bigint', 'timestamp with time zone', 'timestamp with time zone'],
  'Phase 4 session creation function exists'
);
select has_function(
  'public',
  'validate_subscriber_session',
  array['bytea', 'bytea', 'timestamp with time zone'],
  'Phase 4 session validation function exists'
);
select has_function(
  'public',
  'revoke_subscriber_session',
  array['bytea', 'timestamp with time zone'],
  'Phase 4 session revocation function exists'
);
select has_function(
  'public',
  'consume_verification_token_with_theme',
  array['bytea', 'briefing_theme', 'timestamp with time zone'],
  'theme-led verification function exists'
);
select ok(
  not has_function_privilege('anon', 'public.validate_subscriber_session(bytea,bytea,timestamptz)', 'EXECUTE'),
  'browser anon role cannot validate subscriber sessions'
);
select ok(
  not has_function_privilege('anon', 'public.consume_verification_token_with_theme(bytea,briefing_theme,timestamptz)', 'EXECUTE'),
  'browser anon role cannot consume theme-led verification tokens'
);

create temporary table phase_4_subscriber as
select gen_random_uuid() as id, transaction_timestamp() as anchor_at;

insert into public.subscribers (
  id, email, name, status, verified_at, consent_at, consent_version, unverified_expires_at
)
select id, 'phase4@example.com', 'Phase Four Reader', 'active', anchor_at,
       anchor_at - interval '1 day', '2026-07-12', anchor_at - interval '1 day'
from phase_4_subscriber;

select lives_ok(
  format(
    'select * from public.create_subscriber_session(%L::uuid, digest(''phase4-session'', ''sha256''), digest(''phase4-csrf'', ''sha256''), 1, %L::timestamptz, %L::timestamptz)',
    (select id from phase_4_subscriber),
    (select anchor_at + interval '30 minutes' from phase_4_subscriber),
    (select anchor_at from phase_4_subscriber)
  ),
  'a verified subscriber receives a short-lived hashed session'
);
select is(
  (select count(*)::integer from public.validate_subscriber_session(
    digest('phase4-session', 'sha256'), digest('phase4-csrf', 'sha256'),
    (select anchor_at + interval '1 minute' from phase_4_subscriber)
  )),
  1,
  'the correct session and CSRF hashes validate'
);
select is(
  (select count(*)::integer from public.validate_subscriber_session(
    digest('phase4-session', 'sha256'), digest('wrong-csrf', 'sha256'),
    (select anchor_at + interval '1 minute' from phase_4_subscriber)
  )),
  0,
  'an incorrect CSRF hash fails closed'
);
select is(
  (select count(*)::integer from public.validate_subscriber_session(
    digest('phase4-session', 'sha256'), null,
    (select anchor_at + interval '31 minutes' from phase_4_subscriber)
  )),
  0,
  'an expired session fails closed'
);
select lives_ok(
  format(
    'select * from public.create_subscriber_session(%L::uuid, digest(''phase4-revoked'', ''sha256''), digest(''phase4-revoked-csrf'', ''sha256''), 1, %L::timestamptz, %L::timestamptz)',
    (select id from phase_4_subscriber),
    (select anchor_at + interval '30 minutes' from phase_4_subscriber),
    (select anchor_at from phase_4_subscriber)
  ),
  'a second valid session can be created'
);
select ok(
  public.revoke_subscriber_session(
    digest('phase4-revoked', 'sha256'),
    (select anchor_at + interval '2 minutes' from phase_4_subscriber)
  ),
  'one session can be deliberately revoked'
);
select is(
  (select count(*)::integer from public.validate_subscriber_session(
    digest('phase4-revoked', 'sha256'), null,
    (select anchor_at + interval '3 minutes' from phase_4_subscriber)
  )),
  0,
  'a revoked session cannot be replayed'
);
select lives_ok(
  format(
    'select public.invalidate_subscriber_access(%L::uuid, %L::timestamptz)',
    (select id from phase_4_subscriber),
    (select anchor_at + interval '4 minutes' from phase_4_subscriber)
  ),
  'subscriber token-version invalidation succeeds'
);
select is(
  (select count(*)::integer from public.validate_subscriber_session(
    digest('phase4-session', 'sha256'), null,
    (select anchor_at + interval '5 minutes' from phase_4_subscriber)
  )),
  0,
  'token-version changes invalidate all older subscriber sessions'
);

select * from finish();
rollback;
