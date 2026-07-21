-- Bulletin Phase 4: reviewed subscriber-session primitives for passwordless access.
-- Existing Phase 2 migrations remain immutable; these functions only expose
-- bounded operations to the trusted service-role server layer.

create or replace function public.create_subscriber_session(
  p_subscriber_id uuid,
  p_session_hash bytea,
  p_csrf_hash bytea,
  p_expected_token_version bigint,
  p_expires_at timestamptz,
  p_now timestamptz default statement_timestamp()
)
returns table (session_id uuid, expires_at timestamptz)
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  subscriber_record public.subscribers%rowtype;
  created_id uuid;
begin
  if octet_length(p_session_hash) <> 32
     or octet_length(p_csrf_hash) <> 32
     or p_expected_token_version < 1
     or p_expires_at <= p_now
     or p_expires_at > p_now + interval '2 hours' then
    raise exception using errcode = '22023', message = 'invalid subscriber session inputs';
  end if;

  select * into subscriber_record
  from public.subscribers
  where id = p_subscriber_id
  for update;

  if not found
     or subscriber_record.status = 'pending'
     or subscriber_record.token_version <> p_expected_token_version then
    raise exception using errcode = '55000', message = 'verified subscriber access required';
  end if;

  insert into public.subscriber_sessions (
    subscriber_id, session_hash, csrf_hash, token_version, expires_at
  ) values (
    subscriber_record.id, p_session_hash, p_csrf_hash,
    subscriber_record.token_version, p_expires_at
  ) returning id into created_id;

  return query select created_id, p_expires_at;
end;
$$;

create or replace function public.validate_subscriber_session(
  p_session_hash bytea,
  p_csrf_hash bytea default null,
  p_now timestamptz default statement_timestamp()
)
returns table (
  session_id uuid,
  subscriber_id uuid,
  subscriber_public_reference uuid,
  subscriber_status public.subscriber_status,
  token_version bigint,
  expires_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select session.id,
         subscriber.id,
         subscriber.public_reference,
         subscriber.status,
         subscriber.token_version,
         session.expires_at
  from public.subscriber_sessions as session
  join public.subscribers as subscriber on subscriber.id = session.subscriber_id
  where session.session_hash = p_session_hash
    and (p_csrf_hash is null or session.csrf_hash = p_csrf_hash)
    and session.revoked_at is null
    and session.expires_at > p_now
    and subscriber.status in ('active', 'paused')
    and subscriber.token_version = session.token_version;
$$;

create or replace function public.revoke_subscriber_session(
  p_session_hash bytea,
  p_now timestamptz default statement_timestamp()
)
returns boolean
language plpgsql
volatile
security invoker
set search_path = ''
as $$
begin
  update public.subscriber_sessions
  set revoked_at = p_now
  where session_hash = p_session_hash
    and revoked_at is null;
  return found;
end;
$$;

revoke execute on function public.create_subscriber_session(
  uuid, bytea, bytea, bigint, timestamptz, timestamptz
) from public, anon, authenticated;
revoke execute on function public.validate_subscriber_session(
  bytea, bytea, timestamptz
) from public, anon, authenticated;
revoke execute on function public.revoke_subscriber_session(
  bytea, timestamptz
) from public, anon, authenticated;

grant execute on function public.create_subscriber_session(
  uuid, bytea, bytea, bigint, timestamptz, timestamptz
) to service_role;
grant execute on function public.validate_subscriber_session(
  bytea, bytea, timestamptz
) to service_role;
grant execute on function public.revoke_subscriber_session(
  bytea, timestamptz
) to service_role;

comment on function public.create_subscriber_session is
  'Creates a bounded verified-subscriber session using only hashed bearer and CSRF values.';
comment on function public.validate_subscriber_session is
  'Validates expiry, revocation, subscriber state, token version, and optional CSRF hash without exposing personal data.';
comment on function public.revoke_subscriber_session is
  'Revokes one subscriber session by its server-hashed bearer value.';
