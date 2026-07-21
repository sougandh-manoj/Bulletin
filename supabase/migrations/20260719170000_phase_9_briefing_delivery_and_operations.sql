-- Bulletin Phase 9: exact briefing delivery, operational recovery, and backup status.
--
-- This migration extends the Phase 2 delivery and operations foundations. It
-- does not alter a Phase 8 selection: every rendering function consumes the
-- stored delivery_stories rows and exact summary IDs in stored position order.

alter table public.sources
  add column publisher_icon_url text;

alter table public.sources
  add constraint sources_publisher_icon_url_check check (
    publisher_icon_url is null
    or (
      publisher_icon_url = btrim(publisher_icon_url)
      and char_length(publisher_icon_url) between 10 and 1000
      and publisher_icon_url ~ '^https://'
    )
  );

comment on column public.sources.publisher_icon_url is
  'Reviewed normalized HTTPS publisher icon. Null means render publisher text only; never synthesize an icon.';

alter table public.deliveries
  add column smtp_accepted_at timestamptz,
  add column smtp_message_id text,
  add column manual_retry_count smallint not null default 0;

alter table public.deliveries
  add constraint deliveries_smtp_receipt_check check (
    (smtp_accepted_at is null and smtp_message_id is null)
    or (smtp_accepted_at is not null and char_length(btrim(smtp_message_id)) between 1 and 255)
  ),
  add constraint deliveries_manual_retry_count_check check (manual_retry_count between 0 and 1);

create table public.delivery_send_attempts (
  id bigint generated always as identity primary key,
  delivery_id uuid not null references public.deliveries(id) on delete cascade,
  attempt_number smallint not null,
  lease_token uuid not null,
  outcome text not null default 'started',
  failure_code text,
  failure_class text,
  provider_message_id text,
  started_at timestamptz not null,
  finished_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  constraint delivery_send_attempts_delivery_attempt_key unique (delivery_id, attempt_number),
  constraint delivery_send_attempts_attempt_check check (attempt_number between 1 and 20),
  constraint delivery_send_attempts_outcome_check check (
    outcome in ('started', 'accepted', 'temporary-failure', 'permanent-failure', 'ambiguous', 'cancelled')
  ),
  constraint delivery_send_attempts_finished_check check (
    (outcome = 'started' and finished_at is null)
    or (outcome <> 'started' and finished_at is not null)
  ),
  constraint delivery_send_attempts_message_check check (
    provider_message_id is null or char_length(btrim(provider_message_id)) between 1 and 255
  )
);

create index delivery_send_attempts_delivery_idx
  on public.delivery_send_attempts (delivery_id, attempt_number desc);
create index delivery_send_attempts_outcome_idx
  on public.delivery_send_attempts (outcome, finished_at desc);

create table public.system_controls (
  singleton boolean primary key default true check (singleton),
  email_delivery_enabled boolean not null default true,
  delivery_worker_paused boolean not null default false,
  personalization_worker_paused boolean not null default false,
  ingestion_worker_paused boolean not null default false,
  intelligence_worker_paused boolean not null default false,
  updated_at timestamptz not null default statement_timestamp()
);

insert into public.system_controls (singleton) values (true);

create table public.backup_runs (
  id uuid primary key default gen_random_uuid(),
  status text not null,
  storage_adapter text not null,
  object_key text,
  encrypted boolean not null default true,
  checksum_sha256 text,
  size_bytes bigint,
  started_at timestamptz not null default statement_timestamp(),
  completed_at timestamptz,
  failure_code text,
  restore_verified_at timestamptz,
  restore_validation jsonb not null default '{}'::jsonb,
  safe_metadata jsonb not null default '{}'::jsonb,
  constraint backup_runs_status_check check (
    status in ('running', 'succeeded', 'failed', 'restore-verified', 'restore-failed')
  ),
  constraint backup_runs_adapter_check check (
    storage_adapter in ('local', 'google-drive', 'fake')
  ),
  constraint backup_runs_object_key_check check (
    object_key is null or char_length(btrim(object_key)) between 1 and 500
  ),
  constraint backup_runs_checksum_check check (
    checksum_sha256 is null or checksum_sha256 ~ '^[a-f0-9]{64}$'
  ),
  constraint backup_runs_size_check check (size_bytes is null or size_bytes >= 0),
  constraint backup_runs_json_check check (
    jsonb_typeof(restore_validation) = 'object'
    and jsonb_typeof(safe_metadata) = 'object'
  ),
  constraint backup_runs_completion_check check (
    (status = 'running' and completed_at is null)
    or (status <> 'running' and completed_at is not null)
  )
);

alter table public.alert_events
  add column last_notified_at timestamptz,
  add column notification_count integer not null default 0;

alter table public.alert_events
  add constraint alert_events_notification_count_check check (notification_count >= 0);

create index backup_runs_started_idx on public.backup_runs (started_at desc);
create index backup_runs_failed_idx on public.backup_runs (status, started_at desc)
  where status in ('failed', 'restore-failed');

create trigger system_controls_set_updated_at
before update on public.system_controls
for each row execute function bulletin_private.set_updated_at();

-- A render claim sees only the exact subscriber snapshot and exact verified
-- summary/source evidence stored by Phases 7 and 8. Any missing or newly unsafe
-- mutable evidence raises a visible permanent rendering failure; no replacement
-- candidate is looked up here.
create or replace function public.load_delivery_render_context(
  p_delivery_id uuid,
  p_lease_token uuid
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  context jsonb;
  expected_count integer;
  stored_count integer;
  valid_count integer;
begin
  select delivery.actual_story_count into expected_count
  from public.deliveries as delivery
  where delivery.id = p_delivery_id
    and delivery.lease_token = p_lease_token
    and delivery.status = 'claimed'
    and delivery.personalization_status = 'ready';
  if not found then
    raise exception using errcode = '55000', message = 'delivery-render-claim-invalid';
  end if;

  select count(*)::integer into stored_count
  from public.delivery_stories as story
  where story.delivery_id = p_delivery_id;
  if expected_count is null or stored_count <> expected_count then
    raise exception using errcode = '55000', message = 'delivery-story-count-mismatch';
  end if;

  select count(*)::integer into valid_count
  from public.delivery_stories as story
  join public.story_clusters as cluster
    on cluster.id = story.cluster_id
   and cluster.public_reference = story.cluster_public_reference
   and cluster.status = 'verified'
   and cluster.evidence_strength in ('sufficient', 'strong')
   and cluster.conflict_details = '[]'::jsonb
  join public.cluster_summaries as summary
    on summary.id = story.summary_id
   and summary.cluster_id = story.cluster_id
   and summary.cluster_version = story.cluster_version
   and summary.language = story.summary_language
   and summary.status = 'verified'
   and summary.verification_result @> '{"passed":true}'::jsonb
  where story.delivery_id = p_delivery_id
    and exists (
      select 1 from public.cluster_summary_articles as citation
      where citation.summary_id = summary.id
    );
  if valid_count <> expected_count then
    raise exception using errcode = '55000', message = 'delivery-evidence-no-longer-safe';
  end if;

  if exists (
    select 1
    from public.delivery_stories as story
    where story.delivery_id = p_delivery_id
      and story.position <> (
        select count(*) from public.delivery_stories as preceding
        where preceding.delivery_id = p_delivery_id
          and preceding.position <= story.position
      )
  ) then
    raise exception using errcode = '55000', message = 'delivery-story-order-invalid';
  end if;

  select jsonb_build_object(
    'deliveryId', delivery.id,
    'subscriberId', delivery.subscriber_id,
    'recipient', subscriber.email,
    'subscriberName', subscriber.name,
    'subscriberPublicReference', subscriber.public_reference,
    'subscriberTokenVersion', subscriber.token_version,
    'scheduledFor', delivery.scheduled_for,
    'preferenceVersion', delivery.preference_version,
    'language', delivery.language,
    'theme', delivery.theme,
    'timezone', schedule.timezone,
    'actualStoryCount', delivery.actual_story_count,
    'attemptCount', delivery.attempt_count,
    'stories', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'position', story.position,
          'clusterPublicReference', story.cluster_public_reference,
          'clusterVersion', story.cluster_version,
          'summaryId', story.summary_id,
          'category', cluster.category,
          'headline', summary.headline,
          'summary', summary.summary,
          'whyItMatters', summary.why_it_matters,
          'isUpdate', story.is_update,
          'sources', (
            select jsonb_agg(
              jsonb_build_object(
                'name', source.publisher_name,
                'url', article.canonical_url,
                'iconUrl', source.publisher_icon_url
              ) order by citation.citation_order
            )
            from public.cluster_summary_articles as citation
            join public.articles as article on article.id = citation.article_id
            join public.sources as source on source.id = article.source_id
            where citation.summary_id = summary.id
          )
        ) order by story.position
      )
      from public.delivery_stories as story
      join public.story_clusters as cluster on cluster.id = story.cluster_id
      join public.cluster_summaries as summary on summary.id = story.summary_id
      where story.delivery_id = delivery.id
    ), '[]'::jsonb)
  ) into context
  from public.deliveries as delivery
  join public.subscribers as subscriber on subscriber.id = delivery.subscriber_id
  join public.subscriber_schedules as schedule on schedule.subscriber_id = delivery.subscriber_id
  where delivery.id = p_delivery_id
    and delivery.lease_token = p_lease_token
    and delivery.status = 'claimed'
    and delivery.personalization_status = 'ready';

  if context is null then
    raise exception using errcode = '55000', message = 'delivery-render-context-missing';
  end if;
  return context;
end;
$$;

create or replace function public.mark_delivery_rendered(
  p_delivery_id uuid,
  p_lease_token uuid,
  p_actual_story_count smallint,
  p_now timestamptz default statement_timestamp()
)
returns boolean
language plpgsql
volatile
security invoker
set search_path = ''
as $$
begin
  update public.deliveries as delivery
  set status = 'rendering', rendered_at = p_now
  where delivery.id = p_delivery_id
    and delivery.lease_token = p_lease_token
    and delivery.status = 'claimed'
    and delivery.personalization_status = 'ready'
    and delivery.actual_story_count = p_actual_story_count
    and p_actual_story_count = (
      select count(*)::smallint from public.delivery_stories as story
      where story.delivery_id = delivery.id
    );
  return found;
end;
$$;

-- Recover only work whose SMTP outcome is known to be absent. An expired
-- 'sending' lease is deliberately terminal/ambiguous so it can never cause an
-- automatic duplicate email.
create or replace function public.recover_expired_delivery_leases(
  p_now timestamptz default statement_timestamp()
)
returns table (retryable_count integer, ambiguous_count integer)
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  retryable integer;
  ambiguous integer;
begin
  update public.deliveries
  set status = 'retry-wait',
      next_attempt_at = p_now,
      failure_code = 'expired-pre-smtp-lease',
      failure_class = 'transient-infrastructure',
      lease_token = null,
      lease_owner = null,
      lease_expires_at = null
  where status in ('claimed', 'rendering')
    and lease_expires_at <= p_now;
  get diagnostics retryable = row_count;

  with expired as (
    update public.deliveries
    set status = 'failed',
        failure_code = 'smtp-outcome-unknown',
        failure_class = 'ambiguous',
        lease_token = null,
        lease_owner = null,
        lease_expires_at = null
    where status = 'sending'
      and lease_expires_at <= p_now
    returning id, attempt_count
  )
  update public.delivery_send_attempts as attempt
  set outcome = 'ambiguous',
      failure_code = 'smtp-outcome-unknown',
      failure_class = 'ambiguous',
      finished_at = p_now
  from expired
  where attempt.delivery_id = expired.id
    and attempt.attempt_number = expired.attempt_count
    and attempt.outcome = 'started';
  get diagnostics ambiguous = row_count;

  if ambiguous > 0 then
    insert into public.alert_events (
      deduplication_key, severity, title, safe_details,
      first_seen_at, last_seen_at, occurrence_count
    ) values (
      'delivery-smtp-outcome-unknown', 'critical',
      'One or more SMTP outcomes require owner review',
      jsonb_build_object('count', ambiguous), p_now, p_now, 1
    )
    on conflict (deduplication_key) do update
    set status = 'open',
        severity = 'critical',
        last_seen_at = excluded.last_seen_at,
        occurrence_count = public.alert_events.occurrence_count + excluded.occurrence_count,
        safe_details = excluded.safe_details,
        resolved_at = null;
  end if;

  return query select retryable, ambiguous;
end;
$$;

drop function public.claim_deliveries(uuid, integer, integer, timestamptz);

create function public.claim_deliveries(
  p_worker_id uuid,
  p_batch_size integer default 10,
  p_lease_seconds integer default 180,
  p_now timestamptz default statement_timestamp()
)
returns table (delivery_id uuid, lease_token uuid, attempt_count smallint)
language sql
volatile
security invoker
set search_path = ''
as $$
  with candidates as (
    select delivery.id
    from public.deliveries as delivery
    join public.subscribers as subscriber on subscriber.id = delivery.subscriber_id
    join public.system_controls as controls on controls.singleton
    where controls.email_delivery_enabled
      and not controls.delivery_worker_paused
      and subscriber.status = 'active'
      and delivery.personalization_status = 'ready'
      and delivery.status in ('pending', 'retry-wait')
      and delivery.next_attempt_at <= p_now
      and (
        delivery.attempt_count < 4
        or (delivery.manual_retry_count = 1 and delivery.attempt_count < 5)
      )
      and (delivery.lease_expires_at is null or delivery.lease_expires_at <= p_now)
    order by delivery.next_attempt_at, delivery.scheduled_for, delivery.id
    for update of delivery, subscriber skip locked
    limit greatest(1, least(p_batch_size, 50))
  ), claimed as (
    update public.deliveries as delivery
    set status = 'claimed',
        attempt_count = attempt_count + 1,
        lease_token = gen_random_uuid(),
        lease_owner = p_worker_id,
        lease_expires_at = p_now + make_interval(secs => greatest(30, least(p_lease_seconds, 900)))
    from candidates
    where delivery.id = candidates.id
    returning delivery.id, delivery.lease_token, delivery.attempt_count
  )
  select id, claimed.lease_token, claimed.attempt_count from claimed;
$$;

create or replace function public.begin_delivery_send(
  p_delivery_id uuid,
  p_lease_token uuid,
  p_now timestamptz default statement_timestamp()
)
returns boolean
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  delivery_record public.deliveries%rowtype;
  subscriber_status_value public.subscriber_status;
  current_preference_version bigint;
  controls public.system_controls%rowtype;
begin
  select * into delivery_record
  from public.deliveries as delivery
  where delivery.id = p_delivery_id
    and delivery.lease_token = p_lease_token
    and delivery.status = 'rendering'
  for update;
  if not found then return false; end if;

  select * into controls from public.system_controls where singleton for update;
  if not controls.email_delivery_enabled or controls.delivery_worker_paused then
    update public.deliveries
    set status = 'retry-wait',
        next_attempt_at = p_now + interval '5 minutes',
        failure_code = 'email-delivery-disabled',
        failure_class = 'operator-control',
        lease_token = null,
        lease_owner = null,
        lease_expires_at = null
    where id = p_delivery_id;
    return false;
  end if;

  select subscriber.status, preference.version
  into subscriber_status_value, current_preference_version
  from public.subscribers as subscriber
  join public.subscriber_preferences as preference on preference.subscriber_id = subscriber.id
  where subscriber.id = delivery_record.subscriber_id
  for update of subscriber, preference;

  if not found or subscriber_status_value <> 'active'
     or current_preference_version <> delivery_record.preference_version then
    update public.deliveries
    set status = 'cancelled',
        cancelled_at = p_now,
        failure_code = case
          when not found or subscriber_status_value <> 'active' then 'subscriber-not-active'
          else 'preferences-changed'
        end,
        failure_class = 'subscriber-state',
        lease_token = null,
        lease_owner = null,
        lease_expires_at = null
    where id = p_delivery_id;
    return false;
  end if;

  insert into public.delivery_send_attempts (
    delivery_id, attempt_number, lease_token, started_at
  ) values (
    p_delivery_id, delivery_record.attempt_count, p_lease_token, p_now
  );

  update public.deliveries
  set status = 'sending', send_started_at = p_now,
      failure_code = null, failure_class = null
  where id = p_delivery_id;
  return true;
end;
$$;

create or replace function public.complete_delivery_send_with_receipt(
  p_delivery_id uuid,
  p_lease_token uuid,
  p_provider_message_id text,
  p_now timestamptz default statement_timestamp()
)
returns boolean
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  delivery_attempt smallint;
begin
  if char_length(btrim(p_provider_message_id)) not between 1 and 255 then
    raise exception using errcode = '22023', message = 'invalid SMTP receipt';
  end if;

  update public.deliveries
  set status = 'sent',
      sent_at = p_now,
      smtp_accepted_at = p_now,
      smtp_message_id = p_provider_message_id,
      lease_token = null,
      lease_owner = null,
      lease_expires_at = null,
      failure_code = null,
      failure_class = null
  where id = p_delivery_id and lease_token = p_lease_token and status = 'sending'
  returning attempt_count into delivery_attempt;
  if not found then return false; end if;

  update public.delivery_send_attempts
  set outcome = 'accepted', provider_message_id = p_provider_message_id,
      finished_at = p_now
  where delivery_id = p_delivery_id
    and attempt_number = delivery_attempt
    and lease_token = p_lease_token
    and outcome = 'started';
  return true;
end;
$$;

-- Phase 2 completion could mark a delivery sent without an SMTP acceptance
-- receipt. Phase 9 removes that transition entirely so every successful send
-- is bound to a durable attempt and provider receipt.
drop function public.complete_delivery_send(uuid, uuid, timestamptz);

create or replace function public.fail_delivery_claim(
  p_delivery_id uuid,
  p_lease_token uuid,
  p_retry_at timestamptz,
  p_failure_code text,
  p_failure_class text,
  p_is_permanent boolean,
  p_now timestamptz default statement_timestamp()
)
returns boolean
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  delivery_attempt smallint;
begin
  if not p_is_permanent and (p_retry_at is null or p_retry_at <= p_now) then
    raise exception using errcode = '22023', message = 'future retry time required';
  end if;

  update public.deliveries
  set status = case when p_is_permanent then 'failed'::public.delivery_status else 'retry-wait'::public.delivery_status end,
      next_attempt_at = case when p_is_permanent then next_attempt_at else p_retry_at end,
      failure_code = left(coalesce(p_failure_code, 'delivery-failed'), 100),
      failure_class = left(coalesce(p_failure_class, 'unknown'), 100),
      lease_token = null,
      lease_owner = null,
      lease_expires_at = null
  where id = p_delivery_id
    and lease_token = p_lease_token
    and status in ('claimed', 'rendering', 'sending')
  returning attempt_count into delivery_attempt;
  if not found then return false; end if;

  update public.delivery_send_attempts
  set outcome = case when p_is_permanent then 'permanent-failure' else 'temporary-failure' end,
      failure_code = left(coalesce(p_failure_code, 'delivery-failed'), 100),
      failure_class = left(coalesce(p_failure_class, 'unknown'), 100),
      finished_at = p_now
  where delivery_id = p_delivery_id
    and attempt_number = delivery_attempt
    and lease_token = p_lease_token
    and outcome = 'started';
  return true;
end;
$$;

-- Owner session primitives. The application compares the allowlisted address
-- before issuing a token; PostgreSQL stores only one-way 32-byte hashes.
create or replace function public.issue_admin_access_token(
  p_owner_email_hash bytea,
  p_token_hash bytea,
  p_expires_at timestamptz,
  p_now timestamptz default statement_timestamp()
)
returns uuid
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare token_id uuid;
begin
  if octet_length(p_owner_email_hash) <> 32 or octet_length(p_token_hash) <> 32
     or p_expires_at <= p_now or p_expires_at > p_now + interval '30 minutes' then
    raise exception using errcode = '22023', message = 'invalid admin access token inputs';
  end if;
  update public.admin_access_tokens
  set status = 'invalidated', invalidated_at = p_now
  where owner_email_hash = p_owner_email_hash and status = 'active';
  insert into public.admin_access_tokens (owner_email_hash, token_hash, expires_at, created_at)
  values (p_owner_email_hash, p_token_hash, p_expires_at, p_now)
  returning id into token_id;
  return token_id;
end;
$$;

create or replace function public.consume_admin_access_token(
  p_token_hash bytea,
  p_session_hash bytea,
  p_csrf_hash bytea,
  p_session_expires_at timestamptz,
  p_now timestamptz default statement_timestamp()
)
returns boolean
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare token_record public.admin_access_tokens%rowtype;
begin
  if octet_length(p_token_hash) <> 32 or octet_length(p_session_hash) <> 32
     or octet_length(p_csrf_hash) <> 32
     or p_session_expires_at <= p_now
     or p_session_expires_at > p_now + interval '2 hours' then
    raise exception using errcode = '22023', message = 'invalid admin session inputs';
  end if;
  select * into token_record from public.admin_access_tokens
  where token_hash = p_token_hash for update;
  if not found or token_record.status <> 'active' or token_record.expires_at <= p_now then
    return false;
  end if;
  update public.admin_access_tokens
  set status = 'consumed', consumed_at = p_now where id = token_record.id;
  insert into public.admin_sessions (
    owner_email_hash, session_hash, csrf_hash, expires_at, created_at
  ) values (
    token_record.owner_email_hash, p_session_hash, p_csrf_hash,
    p_session_expires_at, p_now
  );
  return true;
end;
$$;

create or replace function public.validate_admin_session(
  p_session_hash bytea,
  p_csrf_hash bytea default null,
  p_now timestamptz default statement_timestamp()
)
returns table (session_id uuid, expires_at timestamptz)
language plpgsql
volatile
security invoker
set search_path = ''
as $$
begin
  return query
  update public.admin_sessions as session
  set last_used_at = p_now
  where session.session_hash = p_session_hash
    and (p_csrf_hash is null or session.csrf_hash = p_csrf_hash)
    and session.revoked_at is null
    and session.expires_at > p_now
  returning session.id, session.expires_at;
end;
$$;

create or replace function public.owner_set_system_control(
  p_control text,
  p_enabled boolean,
  p_request_id uuid,
  p_now timestamptz default statement_timestamp()
)
returns boolean
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare action_name text;
begin
  if p_control = 'email-delivery-enabled' then
    update public.system_controls set email_delivery_enabled = p_enabled where singleton;
  elsif p_control = 'delivery-worker-paused' then
    update public.system_controls set delivery_worker_paused = p_enabled where singleton;
  elsif p_control = 'personalization-worker-paused' then
    update public.system_controls set personalization_worker_paused = p_enabled where singleton;
  elsif p_control = 'ingestion-worker-paused' then
    update public.system_controls set ingestion_worker_paused = p_enabled where singleton;
  elsif p_control = 'intelligence-worker-paused' then
    update public.system_controls set intelligence_worker_paused = p_enabled where singleton;
  else
    raise exception using errcode = '22023', message = 'unknown system control';
  end if;
  action_name := 'owner-control-' || p_control;
  insert into public.admin_audit_log (action, target_type, request_id, outcome, safe_metadata, created_at)
  values (action_name, 'system-control', p_request_id, 'succeeded',
    jsonb_build_object('enabled', p_enabled), p_now);
  return true;
end;
$$;

create or replace function public.owner_cancel_pending_delivery(
  p_delivery_id uuid,
  p_request_id uuid,
  p_now timestamptz default statement_timestamp()
)
returns boolean
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare cancelled boolean;
begin
  update public.deliveries
  set status = 'cancelled', cancelled_at = p_now,
      failure_code = 'owner-cancelled', failure_class = 'owner-action',
      lease_token = null, lease_owner = null, lease_expires_at = null
  where id = p_delivery_id
    and status in ('pending', 'claimed', 'rendering', 'retry-wait')
  returning true into cancelled;
  insert into public.admin_audit_log (action, target_type, request_id, outcome, safe_metadata, created_at)
  values ('owner-cancel-delivery', 'delivery', p_request_id,
    case when coalesce(cancelled, false) then 'succeeded'::public.audit_outcome else 'denied'::public.audit_outcome end,
    jsonb_build_object('deliveryId', p_delivery_id), p_now);
  return coalesce(cancelled, false);
end;
$$;

create or replace function public.owner_retry_temporary_delivery(
  p_delivery_id uuid,
  p_request_id uuid,
  p_now timestamptz default statement_timestamp()
)
returns boolean
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare retried boolean;
begin
  update public.deliveries
  set status = 'retry-wait', next_attempt_at = p_now,
      manual_retry_count = manual_retry_count + 1,
      failure_code = 'owner-safe-retry', failure_class = 'transient-infrastructure'
  where id = p_delivery_id
    and status = 'failed'
    and sent_at is null
    and smtp_accepted_at is null
    and manual_retry_count = 0
    and failure_class in ('smtp-temporary-exhausted', 'transient-infrastructure')
  returning true into retried;
  insert into public.admin_audit_log (action, target_type, request_id, outcome, safe_metadata, created_at)
  values ('owner-retry-delivery', 'delivery', p_request_id,
    case when coalesce(retried, false) then 'succeeded'::public.audit_outcome else 'denied'::public.audit_outcome end,
    jsonb_build_object('deliveryId', p_delivery_id), p_now);
  return coalesce(retried, false);
end;
$$;

create or replace function public.record_operational_alert(
  p_deduplication_key text,
  p_severity public.alert_severity,
  p_title text,
  p_safe_details jsonb,
  p_now timestamptz default statement_timestamp()
)
returns boolean
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  alert_record public.alert_events%rowtype;
  should_notify boolean := false;
begin
  if char_length(btrim(p_deduplication_key)) not between 1 and 200
     or char_length(btrim(p_title)) not between 1 and 300
     or jsonb_typeof(p_safe_details) <> 'object' then
    raise exception using errcode = '22023', message = 'invalid operational alert';
  end if;
  insert into public.alert_events (
    deduplication_key, severity, title, safe_details,
    first_seen_at, last_seen_at, occurrence_count,
    last_notified_at, notification_count
  ) values (
    p_deduplication_key, p_severity, p_title, p_safe_details,
    p_now, p_now, 1,
    case when p_severity = 'critical' then p_now else null end,
    case when p_severity = 'critical' then 1 else 0 end
  )
  on conflict (deduplication_key) do nothing
  returning * into alert_record;
  if found then
    return p_severity = 'critical';
  end if;

  select * into alert_record from public.alert_events
  where deduplication_key = p_deduplication_key for update;
  should_notify := p_severity = 'critical'
    and (alert_record.last_notified_at is null or alert_record.last_notified_at <= p_now - interval '6 hours');
  update public.alert_events
  set status = 'open', severity = p_severity, title = p_title,
      safe_details = p_safe_details, last_seen_at = p_now,
      occurrence_count = occurrence_count + 1, resolved_at = null,
      last_notified_at = case when should_notify then p_now else last_notified_at end,
      notification_count = notification_count + case when should_notify then 1 else 0 end
  where id = alert_record.id;
  return should_notify;
end;
$$;

-- Phase 8 scheduling/personalization respects owner pause without changing a
-- pending selection. Scheduling remains active so due slots are not silently
-- lost; the selector simply leaves them pending until resumed.
create or replace function public.claim_delivery_personalizations(
  p_worker_id uuid,
  p_batch_size integer default 10,
  p_lease_seconds integer default 180,
  p_now timestamptz default statement_timestamp()
)
returns table (delivery_id uuid, lease_token uuid, attempt_count smallint)
language sql
volatile
security invoker
set search_path = ''
as $$
  with candidates as (
    select delivery.id
    from public.deliveries as delivery
    join public.subscribers as subscriber on subscriber.id = delivery.subscriber_id
    join public.system_controls as controls on controls.singleton
    where not controls.personalization_worker_paused
      and subscriber.status = 'active'
      and subscriber.verified_at is not null
      and delivery.status = 'pending'
      and delivery.personalization_status in ('pending', 'retry-wait', 'selecting')
      and (
        (delivery.personalization_status in ('pending', 'retry-wait') and delivery.next_personalization_at <= p_now)
        or (delivery.personalization_status = 'selecting' and delivery.personalization_lease_expires_at <= p_now)
      )
      and (delivery.personalization_lease_expires_at is null or delivery.personalization_lease_expires_at <= p_now)
      and delivery.personalization_attempt_count < 5
    order by delivery.next_personalization_at, delivery.scheduled_for, delivery.id
    for update of delivery, subscriber skip locked
    limit greatest(1, least(p_batch_size, 50))
  ), claimed as (
    update public.deliveries as delivery
    set personalization_status = 'selecting',
        personalization_attempt_count = personalization_attempt_count + 1,
        personalization_lease_token = gen_random_uuid(),
        personalization_lease_owner = p_worker_id,
        personalization_lease_expires_at = p_now + make_interval(secs => greatest(15, least(p_lease_seconds, 900))),
        personalization_failure_code = null
    from candidates
    where delivery.id = candidates.id
    returning delivery.id, delivery.personalization_lease_token, delivery.personalization_attempt_count
  )
  select id, personalization_lease_token, personalization_attempt_count from claimed;
$$;

create or replace function public.claim_due_sources(
  p_worker_id uuid,
  p_batch_size integer default 10,
  p_lease_seconds integer default 120,
  p_now timestamptz default statement_timestamp()
)
returns table (source_id uuid, lease_token uuid)
language sql
volatile
security invoker
set search_path = ''
as $$
  with candidates as (
    select source.id
    from public.sources as source
    join public.system_controls as controls on controls.singleton
    where not controls.ingestion_worker_paused
      and source.is_active
      and source.terms_status = 'approved'
      and source.next_fetch_at <= p_now
      and (source.lease_expires_at is null or source.lease_expires_at <= p_now)
    order by source.next_fetch_at, source.id
    for update of source skip locked
    limit greatest(1, least(p_batch_size, 50))
  ), claimed as (
    update public.sources as source
    set lease_token = gen_random_uuid(), lease_owner = p_worker_id,
        lease_expires_at = p_now + make_interval(secs => greatest(15, least(p_lease_seconds, 900)))
    from candidates where source.id = candidates.id
    returning source.id, source.lease_token
  )
  select id, claimed.lease_token from claimed;
$$;

create or replace function public.claim_articles(
  p_worker_id uuid,
  p_batch_size integer default 10,
  p_lease_seconds integer default 180,
  p_now timestamptz default statement_timestamp()
)
returns table (article_id uuid, lease_token uuid)
language sql
volatile
security invoker
set search_path = ''
as $$
  with candidates as (
    select article.id
    from public.articles as article
    join public.system_controls as controls on controls.singleton
    where not controls.intelligence_worker_paused
      and article.processing_status in ('pending', 'retry-wait', 'claimed')
      and article.duplicate_of_article_id is null
      and article.duplicate_kind is null
      and (
        (article.processing_status in ('pending', 'retry-wait') and article.next_processing_at <= p_now)
        or (article.processing_status = 'claimed' and article.lease_expires_at <= p_now)
      )
      and article.processing_attempts < 5
      and (article.lease_expires_at is null or article.lease_expires_at <= p_now)
    order by article.next_processing_at, article.published_at, article.id
    for update of article skip locked
    limit greatest(1, least(p_batch_size, 25))
  ), claimed as (
    update public.articles as article
    set processing_status = 'claimed', processing_attempts = processing_attempts + 1,
        lease_token = gen_random_uuid(), lease_owner = p_worker_id,
        lease_expires_at = p_now + make_interval(secs => greatest(60, least(p_lease_seconds, 900)))
    from candidates where article.id = candidates.id
    returning article.id, article.lease_token
  )
  select id, claimed.lease_token from claimed;
$$;

create or replace function public.claim_cluster_summaries(
  p_worker_id uuid,
  p_batch_size integer default 5,
  p_lease_seconds integer default 300,
  p_now timestamptz default statement_timestamp()
)
returns table (summary_id uuid, cluster_id uuid, cluster_version integer, language public.briefing_language, lease_token uuid)
language sql
volatile
security invoker
set search_path = ''
as $$
  with candidates as (
    select summary.id
    from public.cluster_summaries as summary
    join public.story_clusters as cluster on cluster.id = summary.cluster_id
    join public.system_controls as controls on controls.singleton
    where not controls.intelligence_worker_paused
      and summary.status in ('pending', 'retry-wait', 'generating')
      and (
        (summary.status in ('pending', 'retry-wait') and summary.next_attempt_at <= p_now)
        or (summary.status = 'generating' and summary.lease_expires_at <= p_now)
      )
      and (summary.lease_expires_at is null or summary.lease_expires_at <= p_now)
      and summary.attempt_count < 5
      and cluster.status = 'verified'
      and cluster.current_version = summary.cluster_version
      and (summary.language = 'en' or exists (
        select 1 from public.cluster_summaries as canonical
        where canonical.cluster_id = summary.cluster_id
          and canonical.cluster_version = summary.cluster_version
          and canonical.language = 'en' and canonical.status = 'verified'
      ))
    order by case when summary.language = 'en' then 0 else 1 end,
      summary.next_attempt_at, summary.cluster_id, summary.language
    for update of summary skip locked
    limit greatest(1, least(p_batch_size, 10))
  ), claimed as (
    update public.cluster_summaries as summary
    set status = 'generating', attempt_count = attempt_count + 1,
        lease_token = gen_random_uuid(), lease_owner = p_worker_id,
        lease_expires_at = p_now + make_interval(secs => greatest(60, least(p_lease_seconds, 900)))
    from candidates where summary.id = candidates.id
    returning summary.id, summary.cluster_id, summary.cluster_version,
      summary.language, summary.lease_token
  )
  select id, cluster_id, cluster_version, language, claimed.lease_token from claimed;
$$;

-- New public tables inherit the fail-closed browser boundary explicitly.
do $$
declare table_name text;
begin
  foreach table_name in array array[
    'delivery_send_attempts', 'system_controls', 'backup_runs'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('alter table public.%I force row level security', table_name);
    execute format(
      'create policy %I on public.%I for all to service_role using (true) with check (true)',
      table_name || '_service_role_only', table_name
    );
  end loop;
end;
$$;

revoke all on public.delivery_send_attempts, public.system_controls,
  public.backup_runs from public, anon, authenticated;
revoke all on all sequences in schema public from public, anon, authenticated;

revoke execute on function public.load_delivery_render_context(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.mark_delivery_rendered(uuid, uuid, smallint, timestamptz) from public, anon, authenticated;
revoke execute on function public.recover_expired_delivery_leases(timestamptz) from public, anon, authenticated;
revoke execute on function public.claim_deliveries(uuid, integer, integer, timestamptz) from public, anon, authenticated;
revoke execute on function public.begin_delivery_send(uuid, uuid, timestamptz) from public, anon, authenticated;
revoke execute on function public.complete_delivery_send_with_receipt(uuid, uuid, text, timestamptz) from public, anon, authenticated;
revoke execute on function public.fail_delivery_claim(uuid, uuid, timestamptz, text, text, boolean, timestamptz) from public, anon, authenticated;
revoke execute on function public.issue_admin_access_token(bytea, bytea, timestamptz, timestamptz) from public, anon, authenticated;
revoke execute on function public.consume_admin_access_token(bytea, bytea, bytea, timestamptz, timestamptz) from public, anon, authenticated;
revoke execute on function public.validate_admin_session(bytea, bytea, timestamptz) from public, anon, authenticated;
revoke execute on function public.owner_set_system_control(text, boolean, uuid, timestamptz) from public, anon, authenticated;
revoke execute on function public.owner_cancel_pending_delivery(uuid, uuid, timestamptz) from public, anon, authenticated;
revoke execute on function public.owner_retry_temporary_delivery(uuid, uuid, timestamptz) from public, anon, authenticated;
revoke execute on function public.record_operational_alert(text, public.alert_severity, text, jsonb, timestamptz) from public, anon, authenticated;
revoke execute on function public.claim_delivery_personalizations(uuid, integer, integer, timestamptz) from public, anon, authenticated;
revoke execute on function public.claim_due_sources(uuid, integer, integer, timestamptz) from public, anon, authenticated;
revoke execute on function public.claim_articles(uuid, integer, integer, timestamptz) from public, anon, authenticated;
revoke execute on function public.claim_cluster_summaries(uuid, integer, integer, timestamptz) from public, anon, authenticated;

grant select, insert, update, delete on public.delivery_send_attempts,
  public.system_controls, public.backup_runs to service_role;
grant usage, select on all sequences in schema public to service_role;
grant execute on function public.load_delivery_render_context(uuid, uuid) to service_role;
grant execute on function public.mark_delivery_rendered(uuid, uuid, smallint, timestamptz) to service_role;
grant execute on function public.recover_expired_delivery_leases(timestamptz) to service_role;
grant execute on function public.claim_deliveries(uuid, integer, integer, timestamptz) to service_role;
grant execute on function public.begin_delivery_send(uuid, uuid, timestamptz) to service_role;
grant execute on function public.complete_delivery_send_with_receipt(uuid, uuid, text, timestamptz) to service_role;
grant execute on function public.fail_delivery_claim(uuid, uuid, timestamptz, text, text, boolean, timestamptz) to service_role;
grant execute on function public.issue_admin_access_token(bytea, bytea, timestamptz, timestamptz) to service_role;
grant execute on function public.consume_admin_access_token(bytea, bytea, bytea, timestamptz, timestamptz) to service_role;
grant execute on function public.validate_admin_session(bytea, bytea, timestamptz) to service_role;
grant execute on function public.owner_set_system_control(text, boolean, uuid, timestamptz) to service_role;
grant execute on function public.owner_cancel_pending_delivery(uuid, uuid, timestamptz) to service_role;
grant execute on function public.owner_retry_temporary_delivery(uuid, uuid, timestamptz) to service_role;
grant execute on function public.record_operational_alert(text, public.alert_severity, text, jsonb, timestamptz) to service_role;
grant execute on function public.claim_delivery_personalizations(uuid, integer, integer, timestamptz) to service_role;
grant execute on function public.claim_due_sources(uuid, integer, integer, timestamptz) to service_role;
grant execute on function public.claim_articles(uuid, integer, integer, timestamptz) to service_role;
grant execute on function public.claim_cluster_summaries(uuid, integer, integer, timestamptz) to service_role;

comment on table public.delivery_send_attempts is
  'Append-like safe attempt audit. Stores delivery IDs and provider receipt IDs, never recipient addresses or private URLs.';
comment on table public.system_controls is
  'Singleton owner-operated kill/pause controls. All changes must also pass through an audited owner RPC.';
comment on table public.backup_runs is
  'Safe encrypted-backup and restore-verification status; credentials, keys, database URLs, and private storage URLs are forbidden.';
