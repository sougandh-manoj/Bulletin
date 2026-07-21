-- Bulletin Phase 2: transactional application operations and resumable worker claims.
-- Every callable function is denied to browser roles in the security migration.

create or replace function bulletin_private.preference_snapshot(p_subscriber_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'name', subscriber.name,
    'countryCode', preference.country_code,
    'stateRegion', preference.state_region,
    'city', preference.city,
    'language', preference.language,
    'categories', preference.categories,
    'customTopics', preference.custom_topics,
    'excludedTopics', preference.excluded_topics,
    'storyCount', preference.story_count,
    'theme', preference.theme,
    'frequency', schedule.frequency,
    'weeklyDay', schedule.weekly_day,
    'deliveryTime', to_char(schedule.local_delivery_time, 'HH24:MI'),
    'timezone', schedule.timezone,
    'version', preference.version
  )
  from public.subscribers as subscriber
  join public.subscriber_preferences as preference on preference.subscriber_id = subscriber.id
  join public.subscriber_schedules as schedule on schedule.subscriber_id = subscriber.id
  where subscriber.id = p_subscriber_id;
$$;

create or replace function public.compute_next_delivery_at(
  p_after timestamptz,
  p_frequency public.delivery_frequency,
  p_weekly_day public.weekday,
  p_local_delivery_time time without time zone,
  p_timezone text
)
returns timestamptz
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  local_date date;
  candidate_date date;
  candidate_at timestamptz;
  candidate_weekday public.weekday;
begin
  if p_after is null or p_timezone is null or btrim(p_timezone) = '' then
    raise exception using errcode = '22023', message = 'delivery calculation inputs are required';
  end if;

  -- PostgreSQL raises for an unknown zone. This is stronger than storing a numeric offset.
  perform 1 from pg_catalog.pg_timezone_names where name = p_timezone;
  if not found then
    raise exception using errcode = '22023', message = 'unknown IANA timezone';
  end if;

  if (p_frequency = 'weekly' and p_weekly_day is null)
     or (p_frequency <> 'weekly' and p_weekly_day is not null) then
    raise exception using errcode = '22023', message = 'weekly day does not match frequency';
  end if;

  local_date := (p_after at time zone p_timezone)::date;

  for day_offset in 0..8 loop
    candidate_date := local_date + day_offset;
    candidate_weekday := case extract(isodow from candidate_date)::integer
      when 1 then 'monday'::public.weekday
      when 2 then 'tuesday'::public.weekday
      when 3 then 'wednesday'::public.weekday
      when 4 then 'thursday'::public.weekday
      when 5 then 'friday'::public.weekday
      when 6 then 'saturday'::public.weekday
      when 7 then 'sunday'::public.weekday
    end;

    if p_frequency = 'daily'
       or (p_frequency = 'weekdays' and extract(isodow from candidate_date) between 1 and 5)
       or (p_frequency = 'weekends' and extract(isodow from candidate_date) between 6 and 7)
       or (p_frequency = 'weekly' and candidate_weekday = p_weekly_day) then
      candidate_at := (candidate_date + p_local_delivery_time) at time zone p_timezone;
      if candidate_at > p_after then
        return candidate_at;
      end if;
    end if;
  end loop;

  raise exception using errcode = '22023', message = 'could not calculate next delivery';
end;
$$;

create or replace function public.create_pending_subscriber(
  p_email text,
  p_name text,
  p_country_code text,
  p_state_region text,
  p_city text,
  p_language public.briefing_language,
  p_categories public.news_category[],
  p_custom_topics text[],
  p_excluded_topics text[],
  p_story_count smallint,
  p_theme public.briefing_theme,
  p_frequency public.delivery_frequency,
  p_weekly_day public.weekday,
  p_local_delivery_time time without time zone,
  p_timezone text,
  p_consent_at timestamptz,
  p_consent_version text,
  p_now timestamptz default statement_timestamp()
)
returns table (subscriber_id uuid, outcome text)
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  existing_subscriber public.subscribers%rowtype;
  created_id uuid;
begin
  select * into existing_subscriber
  from public.subscribers
  where email = p_email
  for update;

  if found and existing_subscriber.status = 'pending'
     and existing_subscriber.unverified_expires_at <= p_now then
    delete from public.subscribers where id = existing_subscriber.id;
    existing_subscriber := null;
  elsif found then
    return query select existing_subscriber.id,
      case when existing_subscriber.status = 'pending' then 'existing-pending' else 'existing-verified' end;
    return;
  end if;

  insert into public.subscribers (
    email, name, consent_at, consent_version, unverified_expires_at
  ) values (
    p_email, p_name, p_consent_at, p_consent_version, p_now + interval '7 days'
  )
  returning id into created_id;

  insert into public.subscriber_preferences (
    subscriber_id, country_code, state_region, city, language, categories,
    custom_topics, excluded_topics, story_count, theme
  ) values (
    created_id, p_country_code, p_state_region, p_city, p_language, p_categories,
    p_custom_topics, p_excluded_topics, p_story_count, p_theme
  );

  insert into public.subscriber_schedules (
    subscriber_id, frequency, weekly_day, local_delivery_time, timezone
  ) values (
    created_id, p_frequency, p_weekly_day, p_local_delivery_time, p_timezone
  );

  return query select created_id, 'created'::text;
exception
  when unique_violation then
    select * into existing_subscriber
    from public.subscribers
    where email = p_email;
    if found then
      return query select existing_subscriber.id,
        case when existing_subscriber.status = 'pending' then 'existing-pending' else 'existing-verified' end;
      return;
    end if;
    raise;
end;
$$;

create or replace function public.save_subscriber_preferences(
  p_subscriber_id uuid,
  p_expected_version bigint,
  p_name text,
  p_country_code text,
  p_state_region text,
  p_city text,
  p_language public.briefing_language,
  p_categories public.news_category[],
  p_custom_topics text[],
  p_excluded_topics text[],
  p_story_count smallint,
  p_theme public.briefing_theme,
  p_frequency public.delivery_frequency,
  p_weekly_day public.weekday,
  p_local_delivery_time time without time zone,
  p_timezone text,
  p_now timestamptz default statement_timestamp()
)
returns bigint
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  current_version bigint;
  current_status public.subscriber_status;
  previous_snapshot jsonb;
  new_version bigint;
begin
  select status into current_status
  from public.subscribers
  where id = p_subscriber_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'subscriber not found';
  end if;
  if current_status = 'pending' then
    raise exception using errcode = '55000', message = 'unverified subscriber preferences cannot be managed';
  end if;

  select version into current_version
  from public.subscriber_preferences
  where subscriber_id = p_subscriber_id
  for update;
  perform 1 from public.subscriber_schedules where subscriber_id = p_subscriber_id for update;

  if current_version is null or current_version <> p_expected_version then
    raise exception using errcode = '40001', message = 'preference version conflict';
  end if;

  previous_snapshot := bulletin_private.preference_snapshot(p_subscriber_id);
  insert into public.preference_versions (subscriber_id, version, reason, snapshot, retain_until)
  values (p_subscriber_id, current_version, 'save-changes', previous_snapshot, p_now + interval '30 days');

  new_version := current_version + 1;

  update public.subscribers set name = p_name where id = p_subscriber_id;
  update public.subscriber_preferences
  set country_code = p_country_code,
      state_region = p_state_region,
      city = p_city,
      language = p_language,
      categories = p_categories,
      custom_topics = p_custom_topics,
      excluded_topics = p_excluded_topics,
      story_count = p_story_count,
      theme = p_theme,
      version = new_version
  where subscriber_id = p_subscriber_id;

  update public.subscriber_schedules
  set frequency = p_frequency,
      weekly_day = p_weekly_day,
      local_delivery_time = p_local_delivery_time,
      timezone = p_timezone,
      next_delivery_at = case
        when current_status = 'active' then public.compute_next_delivery_at(
          p_now, p_frequency, p_weekly_day, p_local_delivery_time, p_timezone
        )
        else null
      end
  where subscriber_id = p_subscriber_id;

  update public.deliveries
  set status = 'cancelled',
      cancelled_at = p_now,
      lease_token = null,
      lease_owner = null,
      lease_expires_at = null,
      failure_code = 'preferences-changed'
  where subscriber_id = p_subscriber_id
    and status in ('pending', 'claimed', 'rendering', 'retry-wait');

  return new_version;
end;
$$;

create or replace function public.save_subscriber_theme(
  p_subscriber_id uuid,
  p_expected_version bigint,
  p_theme public.briefing_theme,
  p_now timestamptz default statement_timestamp()
)
returns bigint
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  current_version bigint;
  current_status public.subscriber_status;
  previous_snapshot jsonb;
  new_version bigint;
begin
  select status into current_status
  from public.subscribers
  where id = p_subscriber_id
  for update;
  if not found or current_status = 'pending' then
    raise exception using errcode = '55000', message = 'verified subscriber required';
  end if;

  select version into current_version
  from public.subscriber_preferences
  where subscriber_id = p_subscriber_id
  for update;
  perform 1 from public.subscriber_schedules where subscriber_id = p_subscriber_id for update;

  if current_version <> p_expected_version then
    raise exception using errcode = '40001', message = 'preference version conflict';
  end if;

  previous_snapshot := bulletin_private.preference_snapshot(p_subscriber_id);
  insert into public.preference_versions (subscriber_id, version, reason, snapshot, retain_until)
  values (p_subscriber_id, current_version, 'theme-change', previous_snapshot, p_now + interval '30 days');

  new_version := current_version + 1;
  update public.subscriber_preferences
  set theme = p_theme, version = new_version
  where subscriber_id = p_subscriber_id;

  -- A queued, unrendered delivery follows the immediate theme choice without duplicating its slot.
  update public.deliveries
  set theme = p_theme, preference_version = new_version
  where subscriber_id = p_subscriber_id and status in ('pending', 'retry-wait');

  return new_version;
end;
$$;

create or replace function public.issue_verification_token(
  p_subscriber_id uuid,
  p_token_hash bytea,
  p_now timestamptz default statement_timestamp()
)
returns table (token_id uuid, generation bigint, expires_at timestamptz)
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  new_generation bigint;
  new_token_id uuid;
  token_expiry timestamptz := p_now + interval '24 hours';
begin
  if octet_length(p_token_hash) <> 32 then
    raise exception using errcode = '22023', message = 'token hash must be 32 bytes';
  end if;

  update public.subscribers
  set verification_generation = verification_generation + 1
  where id = p_subscriber_id and status = 'pending' and unverified_expires_at > p_now
  returning verification_generation into new_generation;
  if not found then
    raise exception using errcode = '55000', message = 'eligible pending subscriber required';
  end if;

  update public.email_verification_tokens
  set status = 'invalidated', invalidated_at = p_now
  where subscriber_id = p_subscriber_id and status = 'active';

  insert into public.email_verification_tokens (
    subscriber_id, token_hash, generation, expires_at
  ) values (
    p_subscriber_id, p_token_hash, new_generation, token_expiry
  ) returning id into new_token_id;

  return query select new_token_id, new_generation, token_expiry;
end;
$$;

create or replace function public.inspect_verification_token(
  p_token_hash bytea,
  p_now timestamptz default statement_timestamp()
)
returns table (is_valid boolean, subscriber_public_reference uuid, expires_at timestamptz)
language sql
stable
security invoker
set search_path = ''
as $$
  select (
      token.status = 'active'
      and token.expires_at > p_now
      and subscriber.status = 'pending'
      and subscriber.unverified_expires_at > p_now
      and subscriber.verification_generation = token.generation
    ),
    subscriber.public_reference,
    token.expires_at
  from public.email_verification_tokens as token
  join public.subscribers as subscriber on subscriber.id = token.subscriber_id
  where token.token_hash = p_token_hash;
$$;

create or replace function public.consume_verification_token(
  p_token_hash bytea,
  p_now timestamptz default statement_timestamp()
)
returns table (subscriber_public_reference uuid, next_delivery_at timestamptz)
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  token_record public.email_verification_tokens%rowtype;
  subscriber_record public.subscribers%rowtype;
  schedule_record public.subscriber_schedules%rowtype;
  calculated_next timestamptz;
begin
  select * into token_record
  from public.email_verification_tokens
  where token_hash = p_token_hash
  for update;
  if not found then
    raise exception using errcode = '22023', message = 'invalid verification token';
  end if;

  select * into subscriber_record
  from public.subscribers
  where id = token_record.subscriber_id
  for update;
  select * into schedule_record
  from public.subscriber_schedules
  where subscriber_id = token_record.subscriber_id
  for update;

  if token_record.status <> 'active'
     or token_record.expires_at <= p_now
     or subscriber_record.status <> 'pending'
     or subscriber_record.unverified_expires_at <= p_now
     or subscriber_record.verification_generation <> token_record.generation then
    raise exception using errcode = '22023', message = 'expired or superseded verification token';
  end if;

  calculated_next := public.compute_next_delivery_at(
    p_now,
    schedule_record.frequency,
    schedule_record.weekly_day,
    schedule_record.local_delivery_time,
    schedule_record.timezone
  );

  update public.email_verification_tokens
  set status = 'consumed', consumed_at = p_now
  where id = token_record.id;
  update public.subscribers
  set status = 'active', verified_at = p_now
  where id = subscriber_record.id;
  update public.subscriber_schedules
  set next_delivery_at = calculated_next
  where subscriber_id = subscriber_record.id;

  return query select subscriber_record.public_reference, calculated_next;
end;
$$;

create or replace function public.invalidate_subscriber_access(
  p_subscriber_id uuid,
  p_now timestamptz default statement_timestamp()
)
returns bigint
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  new_token_version bigint;
begin
  update public.subscribers
  set token_version = token_version + 1
  where id = p_subscriber_id
  returning token_version into new_token_version;
  if not found then
    raise exception using errcode = 'P0002', message = 'subscriber not found';
  end if;

  update public.subscriber_sessions
  set revoked_at = p_now
  where subscriber_id = p_subscriber_id and revoked_at is null;
  return new_token_version;
end;
$$;

create or replace function public.pause_subscriber(
  p_subscriber_id uuid,
  p_now timestamptz default statement_timestamp()
)
returns void
language plpgsql
volatile
security invoker
set search_path = ''
as $$
begin
  update public.subscribers
  set status = 'paused', paused_at = p_now
  where id = p_subscriber_id and status = 'active';
  if not found then
    raise exception using errcode = '55000', message = 'active subscriber required';
  end if;

  update public.subscriber_schedules set next_delivery_at = null where subscriber_id = p_subscriber_id;
  update public.deliveries
  set status = 'cancelled',
      cancelled_at = p_now,
      lease_token = null,
      lease_owner = null,
      lease_expires_at = null,
      failure_code = 'subscriber-paused'
  where subscriber_id = p_subscriber_id
    and status in ('pending', 'claimed', 'rendering', 'retry-wait');
end;
$$;

create or replace function public.resume_subscriber(
  p_subscriber_id uuid,
  p_now timestamptz default statement_timestamp()
)
returns timestamptz
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  schedule_record public.subscriber_schedules%rowtype;
  calculated_next timestamptz;
begin
  perform 1 from public.subscribers
  where id = p_subscriber_id and status = 'paused'
  for update;
  if not found then
    raise exception using errcode = '55000', message = 'paused subscriber required';
  end if;

  select * into schedule_record
  from public.subscriber_schedules
  where subscriber_id = p_subscriber_id
  for update;
  calculated_next := public.compute_next_delivery_at(
    p_now, schedule_record.frequency, schedule_record.weekly_day,
    schedule_record.local_delivery_time, schedule_record.timezone
  );

  update public.subscribers set status = 'active', paused_at = null where id = p_subscriber_id;
  update public.subscriber_schedules set next_delivery_at = calculated_next where subscriber_id = p_subscriber_id;
  return calculated_next;
end;
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
    where source.is_active
      and source.terms_status = 'approved'
      and source.next_fetch_at <= p_now
      and (source.lease_expires_at is null or source.lease_expires_at <= p_now)
    order by source.next_fetch_at, source.id
    for update skip locked
    limit greatest(1, least(p_batch_size, 50))
  ), claimed as (
    update public.sources as source
    set lease_token = gen_random_uuid(),
        lease_owner = p_worker_id,
        lease_expires_at = p_now + make_interval(secs => greatest(15, least(p_lease_seconds, 900)))
    from candidates
    where source.id = candidates.id
    returning source.id, source.lease_token
  )
  select id, claimed.lease_token from claimed;
$$;

create or replace function public.finish_source_claim(
  p_source_id uuid,
  p_lease_token uuid,
  p_succeeded boolean,
  p_next_fetch_at timestamptz,
  p_etag text default null,
  p_last_modified text default null,
  p_now timestamptz default statement_timestamp()
)
returns boolean
language plpgsql
volatile
security invoker
set search_path = ''
as $$
begin
  update public.sources
  set last_fetch_at = p_now,
      next_fetch_at = p_next_fetch_at,
      last_successful_fetch_at = case when p_succeeded then p_now else last_successful_fetch_at end,
      consecutive_failures = case when p_succeeded then 0 else consecutive_failures + 1 end,
      health = case
        when p_succeeded then 'healthy'::public.source_health
        when consecutive_failures + 1 >= 5 then 'failing'::public.source_health
        else 'degraded'::public.source_health
      end,
      etag = case when p_succeeded then coalesce(p_etag, etag) else etag end,
      last_modified = case when p_succeeded then coalesce(p_last_modified, last_modified) else last_modified end,
      lease_token = null,
      lease_owner = null,
      lease_expires_at = null
  where id = p_source_id and lease_token = p_lease_token;
  return found;
end;
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
    where article.processing_status in ('pending', 'retry-wait')
      and article.next_processing_at <= p_now
      and (article.lease_expires_at is null or article.lease_expires_at <= p_now)
    order by article.next_processing_at, article.published_at, article.id
    for update skip locked
    limit greatest(1, least(p_batch_size, 50))
  ), claimed as (
    update public.articles as article
    set processing_status = 'claimed',
        processing_attempts = processing_attempts + 1,
        lease_token = gen_random_uuid(),
        lease_owner = p_worker_id,
        lease_expires_at = p_now + make_interval(secs => greatest(15, least(p_lease_seconds, 900)))
    from candidates
    where article.id = candidates.id
    returning article.id, article.lease_token
  )
  select id, claimed.lease_token from claimed;
$$;

create or replace function public.finish_article_claim(
  p_article_id uuid,
  p_lease_token uuid,
  p_status public.article_processing_status,
  p_retry_at timestamptz default null,
  p_error_code text default null,
  p_now timestamptz default statement_timestamp()
)
returns boolean
language plpgsql
volatile
security invoker
set search_path = ''
as $$
begin
  if p_status not in ('processed', 'retry-wait', 'failed', 'quarantined') then
    raise exception using errcode = '22023', message = 'invalid terminal article claim status';
  end if;
  if p_status = 'retry-wait' and (p_retry_at is null or p_retry_at <= p_now) then
    raise exception using errcode = '22023', message = 'future retry time required';
  end if;

  update public.articles
  set processing_status = p_status,
      next_processing_at = coalesce(p_retry_at, next_processing_at),
      last_error_code = p_error_code,
      processed_at = case when p_status = 'processed' then p_now else processed_at end,
      lease_token = null,
      lease_owner = null,
      lease_expires_at = null
  where id = p_article_id and lease_token = p_lease_token and processing_status = 'claimed';
  return found;
end;
$$;

create or replace function public.enqueue_due_deliveries(
  p_batch_size integer default 50,
  p_now timestamptz default statement_timestamp()
)
returns table (delivery_id uuid, subscriber_id uuid, scheduled_for timestamptz)
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  due_record record;
  created_delivery_id uuid;
  next_at timestamptz;
begin
  for due_record in
    select subscriber.id as subscriber_id,
           preference.version as preference_version,
           preference.language,
           preference.theme,
           schedule.next_delivery_at,
           schedule.frequency,
           schedule.weekly_day,
           schedule.local_delivery_time,
           schedule.timezone
    from public.subscribers as subscriber
    join public.subscriber_preferences as preference on preference.subscriber_id = subscriber.id
    join public.subscriber_schedules as schedule on schedule.subscriber_id = subscriber.id
    where subscriber.status = 'active'
      and schedule.next_delivery_at is not null
      and schedule.next_delivery_at <= p_now
    order by schedule.next_delivery_at, subscriber.id
    for update of subscriber, preference, schedule skip locked
    limit greatest(1, least(p_batch_size, 200))
  loop
    insert into public.deliveries (
      subscriber_id, scheduled_for, preference_version, language, theme, next_attempt_at
    ) values (
      due_record.subscriber_id, due_record.next_delivery_at, due_record.preference_version,
      due_record.language, due_record.theme, p_now
    )
    on conflict on constraint deliveries_subscriber_scheduled_for_key do nothing
    returning id into created_delivery_id;

    next_at := public.compute_next_delivery_at(
      due_record.next_delivery_at,
      due_record.frequency,
      due_record.weekly_day,
      due_record.local_delivery_time,
      due_record.timezone
    );
    update public.subscriber_schedules
    set last_scheduled_at = due_record.next_delivery_at,
        next_delivery_at = next_at
    where public.subscriber_schedules.subscriber_id = due_record.subscriber_id;

    if created_delivery_id is not null then
      delivery_id := created_delivery_id;
      subscriber_id := due_record.subscriber_id;
      scheduled_for := due_record.next_delivery_at;
      return next;
    end if;
    created_delivery_id := null;
  end loop;
end;
$$;

create or replace function public.claim_deliveries(
  p_worker_id uuid,
  p_batch_size integer default 10,
  p_lease_seconds integer default 180,
  p_now timestamptz default statement_timestamp()
)
returns table (delivery_id uuid, lease_token uuid)
language sql
volatile
security invoker
set search_path = ''
as $$
  with candidates as (
    select delivery.id
    from public.deliveries as delivery
    join public.subscribers as subscriber on subscriber.id = delivery.subscriber_id
    where subscriber.status = 'active'
      and delivery.status in ('pending', 'retry-wait')
      and delivery.next_attempt_at <= p_now
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
        lease_expires_at = p_now + make_interval(secs => greatest(15, least(p_lease_seconds, 900)))
    from candidates
    where delivery.id = candidates.id
    returning delivery.id, delivery.lease_token
  )
  select id, claimed.lease_token from claimed;
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
  update public.deliveries
  set status = 'rendering', rendered_at = p_now, actual_story_count = p_actual_story_count
  where id = p_delivery_id and lease_token = p_lease_token and status = 'claimed';
  return found;
end;
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
  delivery_subscriber_id uuid;
  delivery_preference_version bigint;
  subscriber_status_value public.subscriber_status;
  current_preference_version bigint;
begin
  select delivery.subscriber_id, delivery.preference_version
  into delivery_subscriber_id, delivery_preference_version
  from public.deliveries as delivery
  where delivery.id = p_delivery_id
    and delivery.lease_token = p_lease_token
    and delivery.status = 'rendering'
  for update;
  if not found then return false; end if;

  select subscriber.status, preference.version
  into subscriber_status_value, current_preference_version
  from public.subscribers as subscriber
  join public.subscriber_preferences as preference on preference.subscriber_id = subscriber.id
  where subscriber.id = delivery_subscriber_id
  for update of subscriber, preference;

  if subscriber_status_value <> 'active' or current_preference_version <> delivery_preference_version then
    update public.deliveries
    set status = 'cancelled',
        cancelled_at = p_now,
        failure_code = case
          when subscriber_status_value <> 'active' then 'subscriber-not-active'
          else 'preferences-changed'
        end,
        lease_token = null,
        lease_owner = null,
        lease_expires_at = null
    where id = p_delivery_id;
    return false;
  end if;

  update public.deliveries set status = 'sending', send_started_at = p_now where id = p_delivery_id;
  return true;
end;
$$;

create or replace function public.complete_delivery_send(
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
begin
  update public.deliveries
  set status = 'sent',
      sent_at = p_now,
      lease_token = null,
      lease_owner = null,
      lease_expires_at = null,
      failure_code = null,
      failure_class = null
  where id = p_delivery_id and lease_token = p_lease_token and status = 'sending';
  return found;
end;
$$;

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
begin
  if not p_is_permanent and (p_retry_at is null or p_retry_at <= p_now) then
    raise exception using errcode = '22023', message = 'future retry time required';
  end if;

  update public.deliveries
  set status = case when p_is_permanent then 'failed'::public.delivery_status else 'retry-wait'::public.delivery_status end,
      next_attempt_at = case when p_is_permanent then next_attempt_at else p_retry_at end,
      failure_code = p_failure_code,
      failure_class = p_failure_class,
      lease_token = null,
      lease_owner = null,
      lease_expires_at = null
  where id = p_delivery_id
    and lease_token = p_lease_token
    and status in ('claimed', 'rendering', 'sending');
  return found;
end;
$$;

create or replace function public.consume_rate_limit(
  p_scope public.rate_limit_scope,
  p_subject_hash bytea,
  p_window_started_at timestamptz,
  p_expires_at timestamptz,
  p_limit integer
)
returns boolean
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  resulting_count integer;
begin
  if octet_length(p_subject_hash) <> 32 or p_limit < 1 or p_expires_at <= p_window_started_at then
    raise exception using errcode = '22023', message = 'invalid rate-limit inputs';
  end if;

  insert into public.rate_limit_buckets (
    scope, subject_hash, window_started_at, request_count, expires_at
  ) values (
    p_scope, p_subject_hash, p_window_started_at, 1, p_expires_at
  )
  on conflict (scope, subject_hash, window_started_at)
  do update set request_count = public.rate_limit_buckets.request_count + 1
  returning request_count into resulting_count;

  return resulting_count <= p_limit;
end;
$$;

create or replace function public.delete_subscriber(
  p_subscriber_id uuid,
  p_now timestamptz default statement_timestamp()
)
returns boolean
language plpgsql
volatile
security invoker
set search_path = ''
as $$
begin
  -- Preserve an intentionally non-identifying deletion event. The FK target is nulled by the delete.
  insert into public.admin_audit_log (
    action, target_type, target_subscriber_id, outcome, safe_metadata, created_at
  ) values (
    'subscriber-deleted', 'subscriber', p_subscriber_id, 'succeeded',
    jsonb_build_object('initiatedAt', p_now), p_now
  );

  delete from public.subscribers where id = p_subscriber_id;
  return found;
end;
$$;

comment on function public.create_pending_subscriber is
  'Creates a complete pending record atomically. Existing non-expired email rows are returned and never overwritten.';
comment on function public.save_subscriber_preferences is
  'Optimistic version check, previous snapshot, preference/schedule update, and stale queued-delivery cancellation in one transaction.';
comment on function public.begin_delivery_send is
  'Mandatory final database gate immediately before SMTP: active subscriber and current preference version must still match.';
