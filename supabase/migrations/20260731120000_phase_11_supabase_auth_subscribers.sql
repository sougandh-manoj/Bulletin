-- Bulletin Phase 11: additive Supabase Auth linkage for private-beta social login.
-- This migration does not remove the Phase 4 email-link access system.

alter table public.subscribers
  add column if not exists auth_user_id uuid;

create unique index if not exists subscribers_auth_user_id_key
  on public.subscribers (auth_user_id)
  where auth_user_id is not null;

create or replace function public.find_authenticated_subscriber(
  p_auth_user_id uuid,
  p_email text
)
returns table (
  subscriber_id uuid,
  outcome text
)
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  subscriber_record public.subscribers%rowtype;
begin
  if p_auth_user_id is null
     or p_email is null
     or p_email <> lower(btrim(p_email)) then
    raise exception using errcode = '22023', message = 'invalid auth subscriber lookup inputs';
  end if;

  select * into subscriber_record
  from public.subscribers
  where auth_user_id = p_auth_user_id
  for update;

  if found then
    if subscriber_record.status in ('active', 'paused') then
      return query select subscriber_record.id, 'found-by-auth'::text;
    else
      return query select subscriber_record.id, 'pending'::text;
    end if;
    return;
  end if;

  select * into subscriber_record
  from public.subscribers
  where email = p_email
  for update;

  if not found then
    return;
  end if;

  if subscriber_record.auth_user_id is not null
     and subscriber_record.auth_user_id <> p_auth_user_id then
    return query select subscriber_record.id, 'email-claimed'::text;
    return;
  end if;

  if subscriber_record.status not in ('active', 'paused') then
    return query select subscriber_record.id, 'pending'::text;
    return;
  end if;

  update public.subscribers
  set auth_user_id = p_auth_user_id
  where id = subscriber_record.id
    and auth_user_id is null;

  return query select subscriber_record.id, 'linked-by-email'::text;
end;
$$;

create or replace function public.create_authenticated_subscriber(
  p_auth_user_id uuid,
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
returns table (subscriber_id uuid, outcome text, next_delivery_at timestamptz)
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  existing_subscriber public.subscribers%rowtype;
  created_id uuid;
  calculated_next timestamptz;
begin
  if p_auth_user_id is null
     or p_email is null
     or p_email <> lower(btrim(p_email)) then
    raise exception using errcode = '22023', message = 'invalid authenticated subscriber inputs';
  end if;

  select * into existing_subscriber
  from public.subscribers
  where auth_user_id = p_auth_user_id
  for update;

  if found and existing_subscriber.status in ('active', 'paused') then
    select schedule.next_delivery_at into calculated_next
    from public.subscriber_schedules as schedule
    where schedule.subscriber_id = existing_subscriber.id;

    return query select existing_subscriber.id, 'existing'::text, calculated_next;
    return;
  elsif found then
    delete from public.subscribers where id = existing_subscriber.id;
    existing_subscriber := null;
  end if;

  select * into existing_subscriber
  from public.subscribers
  where email = p_email
  for update;

  if found and existing_subscriber.auth_user_id is not null
     and existing_subscriber.auth_user_id <> p_auth_user_id then
    return query select existing_subscriber.id, 'email-claimed'::text, null::timestamptz;
    return;
  elsif found and existing_subscriber.status in ('active', 'paused') then
    update public.subscribers
    set auth_user_id = coalesce(auth_user_id, p_auth_user_id)
    where id = existing_subscriber.id;

    select schedule.next_delivery_at into calculated_next
    from public.subscriber_schedules as schedule
    where schedule.subscriber_id = existing_subscriber.id;

    return query select existing_subscriber.id, 'existing'::text, calculated_next;
    return;
  elsif found then
    delete from public.subscribers where id = existing_subscriber.id;
  end if;

  calculated_next := public.compute_next_delivery_at(
    p_now,
    p_frequency,
    p_weekly_day,
    p_local_delivery_time,
    p_timezone
  );

  insert into public.subscribers (
    auth_user_id, email, name, status, verified_at, consent_at, consent_version,
    unverified_expires_at
  ) values (
    p_auth_user_id, p_email, p_name, 'active', p_now, p_consent_at,
    p_consent_version, p_now
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
    subscriber_id, frequency, weekly_day, local_delivery_time, timezone,
    next_delivery_at
  ) values (
    created_id, p_frequency, p_weekly_day, p_local_delivery_time, p_timezone,
    calculated_next
  );

  return query select created_id, 'created'::text, calculated_next;
exception
  when unique_violation then
    return query
      select existing.id, 'existing'::text, schedule.next_delivery_at
      from public.subscribers as existing
      left join public.subscriber_schedules as schedule
        on schedule.subscriber_id = existing.id
      where existing.auth_user_id = p_auth_user_id
         or existing.email = p_email
      limit 1;
end;
$$;

revoke execute on function public.find_authenticated_subscriber(uuid, text)
  from public, anon, authenticated;
revoke execute on function public.create_authenticated_subscriber(
  uuid, text, text, text, text, text, public.briefing_language,
  public.news_category[], text[], text[], smallint, public.briefing_theme,
  public.delivery_frequency, public.weekday, time without time zone, text,
  timestamptz, text, timestamptz
) from public, anon, authenticated;

grant execute on function public.find_authenticated_subscriber(uuid, text)
  to service_role;
grant execute on function public.create_authenticated_subscriber(
  uuid, text, text, text, text, text, public.briefing_language,
  public.news_category[], text[], text[], smallint, public.briefing_theme,
  public.delivery_frequency, public.weekday, time without time zone, text,
  timestamptz, text, timestamptz
) to service_role;

comment on column public.subscribers.auth_user_id is
  'Supabase Auth user id that owns this subscriber account. Nullable during the social-login migration.';
comment on function public.find_authenticated_subscriber is
  'Resolves an active or paused subscriber by Supabase Auth user id, lazily linking one matching verified email row.';
comment on function public.create_authenticated_subscriber is
  'Creates an active subscriber for a verified Supabase Auth user, or returns an existing account without duplicating email or auth ownership.';
