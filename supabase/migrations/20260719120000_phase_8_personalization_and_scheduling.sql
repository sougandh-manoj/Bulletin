-- Bulletin Phase 8: deterministic personalization and timezone-safe scheduling.
--
-- Delivery creation remains separate from rendering/sending. A dedicated
-- personalization lease lets an expired worker resume selection without
-- consuming the Phase 9 delivery lease or calling a summary provider.

create type public.personalization_status as enum (
  'pending', 'selecting', 'ready', 'retry-wait', 'failed'
);

alter table public.subscriber_schedules
  add column schedule_error_code text,
  add column schedule_error_at timestamptz;

alter table public.subscriber_schedules
  add constraint subscriber_schedules_error_check check (
    (schedule_error_code is null and schedule_error_at is null)
    or (
      schedule_error_code is not null
      and char_length(btrim(schedule_error_code)) between 1 and 100
      and schedule_error_at is not null
      and next_delivery_at is null
    )
  );

alter table public.deliveries
  add column news_window_started_at timestamptz,
  add column news_window_ended_at timestamptz,
  add column personalization_status public.personalization_status not null default 'pending',
  add column personalization_attempt_count smallint not null default 0,
  add column next_personalization_at timestamptz not null default statement_timestamp(),
  add column personalization_lease_token uuid,
  add column personalization_lease_owner uuid,
  add column personalization_lease_expires_at timestamptz,
  add column personalized_at timestamptz,
  add column personalization_failure_code text,
  add column personalization_version text,
  add column personalization_metadata jsonb not null default '{}'::jsonb;

alter table public.deliveries
  add constraint deliveries_news_window_check check (
    (news_window_started_at is null and news_window_ended_at is null)
    or (
      news_window_started_at is not null
      and news_window_ended_at is not null
      and news_window_started_at < news_window_ended_at
      and news_window_ended_at = scheduled_for
    )
  ),
  add constraint deliveries_personalization_attempt_check check (
    personalization_attempt_count between 0 and 10
  ),
  add constraint deliveries_personalization_lease_check check (
    (
      personalization_lease_token is null
      and personalization_lease_owner is null
      and personalization_lease_expires_at is null
    )
    or (
      personalization_lease_token is not null
      and personalization_lease_owner is not null
      and personalization_lease_expires_at is not null
    )
  ),
  add constraint deliveries_personalization_metadata_check check (
    jsonb_typeof(personalization_metadata) = 'object'
  ),
  add constraint deliveries_personalization_ready_check check (
    personalization_status <> 'ready'
    or (
      personalized_at is not null
      and personalization_version is not null
      and news_window_started_at is not null
      and news_window_ended_at is not null
      and actual_story_count is not null
      and personalization_lease_token is null
      and personalization_lease_owner is null
      and personalization_lease_expires_at is null
    )
  );

create index deliveries_personalization_due_idx
  on public.deliveries (next_personalization_at, scheduled_for, id)
  where personalization_status in ('pending', 'retry-wait', 'selecting')
    and status = 'pending';

alter table public.delivery_stories
  add column selection_score numeric(8, 3) not null default 0,
  add column selection_reasons jsonb not null default '{}'::jsonb,
  add column subject_key text not null default 'unspecified';

alter table public.delivery_stories
  add constraint delivery_stories_selection_score_check check (
    selection_score >= 0 and selection_score <= 99999
  ),
  add constraint delivery_stories_selection_reasons_check check (
    jsonb_typeof(selection_reasons) = 'object'
  ),
  add constraint delivery_stories_subject_key_check check (
    char_length(btrim(subject_key)) between 1 and 200
  );

create index delivery_stories_subscriber_repeat_idx
  on public.delivery_stories (cluster_public_reference, cluster_version, delivery_id);

create or replace function bulletin_private.clear_schedule_error_on_recovery()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.next_delivery_at is not null then
    new.schedule_error_code := null;
    new.schedule_error_at := null;
  end if;
  return new;
end;
$$;

create trigger subscriber_schedules_clear_phase_8_error
before insert or update on public.subscriber_schedules
for each row execute function bulletin_private.clear_schedule_error_on_recovery();

create or replace function bulletin_private.cancel_personalization_with_delivery()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.status = 'cancelled' and old.status is distinct from new.status then
    new.personalization_status := case
      when old.personalization_status = 'ready' then old.personalization_status
      else 'failed'::public.personalization_status
    end;
    new.personalization_failure_code := coalesce(
      new.personalization_failure_code,
      new.failure_code,
      'delivery-cancelled'
    );
    new.personalization_lease_token := null;
    new.personalization_lease_owner := null;
    new.personalization_lease_expires_at := null;
  end if;
  return new;
end;
$$;

create trigger deliveries_cancel_phase_8_selection
before update on public.deliveries
for each row execute function bulletin_private.cancel_personalization_with_delivery();

create or replace function public.compute_delivery_window_start(
  p_scheduled_for timestamptz,
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
  scheduled_local_date date;
  candidate_date date;
  candidate_at timestamptz;
  candidate_weekday public.weekday;
begin
  if p_scheduled_for is null or p_timezone is null or btrim(p_timezone) = '' then
    raise exception using errcode = '22023', message = 'delivery window inputs are required';
  end if;
  perform 1 from pg_catalog.pg_timezone_names where name = p_timezone;
  if not found then
    raise exception using errcode = '22023', message = 'unknown IANA timezone';
  end if;
  if (p_frequency = 'weekly' and p_weekly_day is null)
     or (p_frequency <> 'weekly' and p_weekly_day is not null) then
    raise exception using errcode = '22023', message = 'weekly day does not match frequency';
  end if;

  scheduled_local_date := (p_scheduled_for at time zone p_timezone)::date;
  for day_offset in 1..8 loop
    candidate_date := scheduled_local_date - day_offset;
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
      if candidate_at < p_scheduled_for then
        return candidate_at;
      end if;
    end if;
  end loop;
  raise exception using errcode = '22023', message = 'could not calculate delivery window';
end;
$$;

-- Replace the Phase 2 scheduler with the same signature. The due row, unique
-- delivery slot, news window, and next UTC slot are committed together. An
-- invalid stored timezone is isolated to its schedule and cannot abort other
-- subscribers in the batch.
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
  normal_window_start timestamptz;
  last_sent_at timestamptz;
  window_start timestamptz;
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
      and subscriber.verified_at is not null
      and schedule.next_delivery_at is not null
      and schedule.next_delivery_at <= p_now
    order by schedule.next_delivery_at, subscriber.id
    for update of subscriber, preference, schedule skip locked
    limit greatest(1, least(p_batch_size, 200))
  loop
    begin
      created_delivery_id := null;
      last_sent_at := null;
      next_at := public.compute_next_delivery_at(
        due_record.next_delivery_at,
        due_record.frequency,
        due_record.weekly_day,
        due_record.local_delivery_time,
        due_record.timezone
      );
      normal_window_start := public.compute_delivery_window_start(
        due_record.next_delivery_at,
        due_record.frequency,
        due_record.weekly_day,
        due_record.local_delivery_time,
        due_record.timezone
      );
      select max(prior.scheduled_for)
      into last_sent_at
      from public.deliveries as prior
      where prior.subscriber_id = due_record.subscriber_id
        and prior.status = 'sent'
        and prior.scheduled_for < due_record.next_delivery_at;
      window_start := greatest(coalesce(last_sent_at, normal_window_start), normal_window_start);

      insert into public.deliveries (
        subscriber_id, scheduled_for, preference_version, language, theme,
        next_attempt_at, news_window_started_at, news_window_ended_at,
        next_personalization_at
      ) values (
        due_record.subscriber_id, due_record.next_delivery_at,
        due_record.preference_version, due_record.language, due_record.theme,
        p_now, window_start, due_record.next_delivery_at, p_now
      )
      on conflict on constraint deliveries_subscriber_scheduled_for_key do nothing
      returning id into created_delivery_id;

      update public.subscriber_schedules
      set last_scheduled_at = due_record.next_delivery_at,
          next_delivery_at = next_at,
          schedule_error_code = null,
          schedule_error_at = null
      where public.subscriber_schedules.subscriber_id = due_record.subscriber_id;

      if created_delivery_id is not null then
        delivery_id := created_delivery_id;
        subscriber_id := due_record.subscriber_id;
        scheduled_for := due_record.next_delivery_at;
        return next;
      end if;
    exception when others then
      update public.subscriber_schedules
      set next_delivery_at = null,
          schedule_error_code = 'invalid-schedule-data',
          schedule_error_at = p_now
      where public.subscriber_schedules.subscriber_id = due_record.subscriber_id;
    end;
  end loop;
end;
$$;

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
    where subscriber.status = 'active'
      and subscriber.verified_at is not null
      and delivery.status = 'pending'
      and delivery.personalization_status in ('pending', 'retry-wait', 'selecting')
      and (
        (delivery.personalization_status in ('pending', 'retry-wait')
          and delivery.next_personalization_at <= p_now)
        or (delivery.personalization_status = 'selecting'
          and delivery.personalization_lease_expires_at <= p_now)
      )
      and (
        delivery.personalization_lease_expires_at is null
        or delivery.personalization_lease_expires_at <= p_now
      )
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
        personalization_lease_expires_at = p_now
          + make_interval(secs => greatest(15, least(p_lease_seconds, 900))),
        personalization_failure_code = null
    from candidates
    where delivery.id = candidates.id
    returning delivery.id, delivery.personalization_lease_token,
      delivery.personalization_attempt_count
  )
  select id, personalization_lease_token, personalization_attempt_count from claimed;
$$;

create or replace function public.load_delivery_personalization_context(
  p_delivery_id uuid,
  p_lease_token uuid
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'deliveryId', delivery.id,
    'subscriberId', delivery.subscriber_id,
    'scheduledFor', delivery.scheduled_for,
    'windowStartedAt', delivery.news_window_started_at,
    'windowEndedAt', delivery.news_window_ended_at,
    'preferenceVersion', delivery.preference_version,
    'language', delivery.language,
    'countryCode', preference.country_code,
    'stateRegion', preference.state_region,
    'city', preference.city,
    'categories', preference.categories,
    'customTopics', preference.custom_topics,
    'excludedTopics', preference.excluded_topics,
    'storyCount', preference.story_count,
    'frequency', schedule.frequency,
    'weeklyDay', schedule.weekly_day,
    'timezone', schedule.timezone
  )
  from public.deliveries as delivery
  join public.subscribers as subscriber on subscriber.id = delivery.subscriber_id
  join public.subscriber_preferences as preference on preference.subscriber_id = delivery.subscriber_id
  join public.subscriber_schedules as schedule on schedule.subscriber_id = delivery.subscriber_id
  where delivery.id = p_delivery_id
    and delivery.personalization_lease_token = p_lease_token
    and delivery.personalization_status = 'selecting'
    and delivery.status = 'pending'
    and subscriber.status = 'active'
    and subscriber.verified_at is not null
    and preference.version = delivery.preference_version;
$$;

create or replace function public.list_delivery_personalization_candidates(
  p_delivery_id uuid,
  p_lease_token uuid,
  p_limit integer default 200
)
returns table (
  cluster_id uuid,
  cluster_public_reference uuid,
  cluster_version integer,
  category public.news_category,
  country_code text,
  state_region text,
  city text,
  central_topics text[],
  entities jsonb,
  event_type text,
  evidence_strength public.evidence_strength,
  evidence_independence_count smallint,
  latest_event_at timestamptz,
  summary_id uuid,
  summary_available boolean,
  headline text,
  source_reliability public.source_reliability,
  factual_depth smallint,
  previous_delivered_version integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  select cluster.id,
         cluster.public_reference,
         cluster.current_version,
         cluster.category,
         cluster.country_code,
         cluster.state_region,
         cluster.city,
         cluster.central_topics,
         cluster.entities,
         cluster.event_type,
         cluster.evidence_strength,
         cluster.evidence_independence_count,
         cluster.latest_event_at,
         localized.id,
         localized.id is not null,
         coalesce(localized.headline, canonical.headline),
         coalesce(evidence.source_reliability, 'tier-3'::public.source_reliability),
         coalesce(evidence.factual_depth, 0)::smallint,
         history.previous_delivered_version
  from public.deliveries as delivery
  join public.subscribers as subscriber on subscriber.id = delivery.subscriber_id
  join public.story_clusters as cluster
    on cluster.status = 'verified'
   and cluster.evidence_strength in ('sufficient', 'strong')
   and cluster.conflict_details = '[]'::jsonb
   and cluster.latest_event_at > delivery.news_window_started_at
   and cluster.latest_event_at <= delivery.news_window_ended_at
  join public.cluster_summaries as canonical
    on canonical.cluster_id = cluster.id
   and canonical.cluster_version = cluster.current_version
   and canonical.language = 'en'
   and canonical.status = 'verified'
   and canonical.verification_result @> '{"passed":true}'::jsonb
  left join public.cluster_summaries as localized
    on localized.cluster_id = cluster.id
   and localized.cluster_version = cluster.current_version
   and localized.language = delivery.language
   and localized.status = 'verified'
   and localized.verification_result @> '{"passed":true}'::jsonb
  left join lateral (
    select case
             when bool_or(source.reliability = 'tier-1') then 'tier-1'::public.source_reliability
             when bool_or(source.reliability = 'tier-2') then 'tier-2'::public.source_reliability
             else 'tier-3'::public.source_reliability
           end as source_reliability,
           max(coalesce(article.factual_depth, 0))::smallint as factual_depth
    from public.story_cluster_articles as relation
    join public.articles as article on article.id = relation.article_id
    join public.sources as source on source.id = article.source_id
    where relation.cluster_id = cluster.id
      and relation.decision = 'accepted'
      and relation.added_in_version <= cluster.current_version
  ) as evidence on true
  left join lateral (
    select max(story.cluster_version)::integer as previous_delivered_version
    from public.delivery_stories as story
    join public.deliveries as prior_delivery on prior_delivery.id = story.delivery_id
    where prior_delivery.subscriber_id = delivery.subscriber_id
      and prior_delivery.id <> delivery.id
      and story.cluster_public_reference = cluster.public_reference
  ) as history on true
  where delivery.id = p_delivery_id
    and delivery.personalization_lease_token = p_lease_token
    and delivery.personalization_status = 'selecting'
    and delivery.status = 'pending'
    and subscriber.status = 'active'
  order by cluster.latest_event_at desc, cluster.id
  limit greatest(1, least(p_limit, 500));
$$;

create or replace function public.complete_delivery_personalization(
  p_delivery_id uuid,
  p_lease_token uuid,
  p_selected_stories jsonb,
  p_personalization_version text,
  p_metadata jsonb,
  p_now timestamptz default statement_timestamp()
)
returns boolean
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  delivery_record record;
  item jsonb;
  expected_position integer := 1;
  target_cluster record;
begin
  if jsonb_typeof(p_selected_stories) <> 'array'
     or jsonb_typeof(p_metadata) <> 'object'
     or char_length(btrim(p_personalization_version)) not between 1 and 80 then
    raise exception using errcode = '22023', message = 'invalid personalization result';
  end if;

  select delivery.*, subscriber.status as subscriber_status,
         subscriber.verified_at, preference.version as current_preference_version,
         preference.story_count
  into delivery_record
  from public.deliveries as delivery
  join public.subscribers as subscriber on subscriber.id = delivery.subscriber_id
  join public.subscriber_preferences as preference on preference.subscriber_id = delivery.subscriber_id
  where delivery.id = p_delivery_id
    and delivery.personalization_lease_token = p_lease_token
    and delivery.personalization_status = 'selecting'
    and delivery.status = 'pending'
  for update of delivery, subscriber, preference;
  if not found then return false; end if;

  if delivery_record.subscriber_status <> 'active'
     or delivery_record.verified_at is null
     or delivery_record.current_preference_version <> delivery_record.preference_version then
    update public.deliveries
    set status = 'cancelled',
        cancelled_at = p_now,
        failure_code = case
          when delivery_record.subscriber_status <> 'active' then 'subscriber-not-active'
          else 'preferences-changed'
        end
    where id = p_delivery_id;
    return false;
  end if;
  if jsonb_array_length(p_selected_stories) > delivery_record.story_count
     or jsonb_array_length(p_selected_stories) > 10 then
    raise exception using errcode = '22023', message = 'selected story count exceeds preference';
  end if;

  delete from public.delivery_stories where delivery_id = p_delivery_id;
  for item in select value from jsonb_array_elements(p_selected_stories)
  loop
    if (item->>'position')::integer <> expected_position then
      raise exception using errcode = '22023', message = 'story positions must be contiguous';
    end if;
    select cluster.id, cluster.public_reference, cluster.current_version, summary.id as summary_id
    into target_cluster
    from public.story_clusters as cluster
    join public.cluster_summaries as summary
      on summary.cluster_id = cluster.id
     and summary.cluster_version = cluster.current_version
     and summary.language = delivery_record.language
     and summary.status = 'verified'
     and summary.verification_result @> '{"passed":true}'::jsonb
    where cluster.id = (item->>'clusterId')::uuid
      and cluster.public_reference = (item->>'clusterPublicReference')::uuid
      and cluster.current_version = (item->>'clusterVersion')::integer
      and cluster.status = 'verified'
      and cluster.evidence_strength in ('sufficient', 'strong')
      and cluster.conflict_details = '[]'::jsonb
      and cluster.latest_event_at > delivery_record.news_window_started_at
      and cluster.latest_event_at <= delivery_record.news_window_ended_at
      and summary.id = (item->>'summaryId')::uuid;
    if not found then
      raise exception using errcode = '55000', message = 'selected story is no longer eligible';
    end if;
    if exists (
      select 1
      from public.delivery_stories as prior_story
      join public.deliveries as prior_delivery on prior_delivery.id = prior_story.delivery_id
      where prior_delivery.subscriber_id = delivery_record.subscriber_id
        and prior_delivery.id <> p_delivery_id
        and prior_story.cluster_public_reference = target_cluster.public_reference
        and prior_story.cluster_version >= target_cluster.current_version
    ) then
      raise exception using errcode = '55000', message = 'story version was already delivered';
    end if;

    insert into public.delivery_stories (
      delivery_id, position, cluster_id, cluster_public_reference,
      cluster_version, summary_id, summary_language, is_update,
      selection_score, selection_reasons, subject_key
    ) values (
      p_delivery_id, expected_position, target_cluster.id,
      target_cluster.public_reference, target_cluster.current_version,
      target_cluster.summary_id, delivery_record.language,
      target_cluster.current_version > 1,
      (item->>'score')::numeric,
      coalesce(item->'reasons', '{}'::jsonb),
      left(coalesce(nullif(btrim(item->>'subjectKey'), ''), 'unspecified'), 200)
    );
    expected_position := expected_position + 1;
  end loop;

  update public.deliveries
  set personalization_status = 'ready',
      personalized_at = p_now,
      personalization_version = p_personalization_version,
      personalization_metadata = p_metadata,
      personalization_failure_code = null,
      personalization_lease_token = null,
      personalization_lease_owner = null,
      personalization_lease_expires_at = null,
      actual_story_count = jsonb_array_length(p_selected_stories)
  where id = p_delivery_id;
  return true;
end;
$$;

create or replace function public.fail_delivery_personalization_claim(
  p_delivery_id uuid,
  p_lease_token uuid,
  p_retry_at timestamptz,
  p_failure_code text,
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
  set personalization_status = case
        when p_is_permanent then 'failed'::public.personalization_status
        else 'retry-wait'::public.personalization_status
      end,
      next_personalization_at = case
        when p_is_permanent then next_personalization_at else p_retry_at
      end,
      personalization_failure_code = left(coalesce(p_failure_code, 'personalization-failed'), 100),
      personalization_lease_token = null,
      personalization_lease_owner = null,
      personalization_lease_expires_at = null
  where id = p_delivery_id
    and personalization_lease_token = p_lease_token
    and personalization_status = 'selecting';
  return found;
end;
$$;

-- The existing Phase 2 delivery lease becomes the Phase 9 rendering/sending
-- lease. It must never overtake the Phase 8 selection snapshot.
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
      and delivery.personalization_status = 'ready'
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

revoke execute on function public.compute_delivery_window_start(
  timestamptz, public.delivery_frequency, public.weekday, time without time zone, text
) from public, anon, authenticated;
revoke execute on function public.enqueue_due_deliveries(integer, timestamptz)
  from public, anon, authenticated;
revoke execute on function public.claim_delivery_personalizations(uuid, integer, integer, timestamptz)
  from public, anon, authenticated;
revoke execute on function public.load_delivery_personalization_context(uuid, uuid)
  from public, anon, authenticated;
revoke execute on function public.list_delivery_personalization_candidates(uuid, uuid, integer)
  from public, anon, authenticated;
revoke execute on function public.complete_delivery_personalization(uuid, uuid, jsonb, text, jsonb, timestamptz)
  from public, anon, authenticated;
revoke execute on function public.fail_delivery_personalization_claim(uuid, uuid, timestamptz, text, boolean, timestamptz)
  from public, anon, authenticated;
revoke execute on function public.claim_deliveries(uuid, integer, integer, timestamptz)
  from public, anon, authenticated;

grant execute on function public.compute_delivery_window_start(
  timestamptz, public.delivery_frequency, public.weekday, time without time zone, text
) to service_role;
grant execute on function public.enqueue_due_deliveries(integer, timestamptz)
  to service_role;
grant execute on function public.claim_delivery_personalizations(uuid, integer, integer, timestamptz)
  to service_role;
grant execute on function public.load_delivery_personalization_context(uuid, uuid)
  to service_role;
grant execute on function public.list_delivery_personalization_candidates(uuid, uuid, integer)
  to service_role;
grant execute on function public.complete_delivery_personalization(uuid, uuid, jsonb, text, jsonb, timestamptz)
  to service_role;
grant execute on function public.fail_delivery_personalization_claim(uuid, uuid, timestamptz, text, boolean, timestamptz)
  to service_role;
grant execute on function public.claim_deliveries(uuid, integer, integer, timestamptz)
  to service_role;

comment on function public.enqueue_due_deliveries is
  'Atomically creates one unique delivery per subscriber UTC slot, stores its bounded news window, and advances the next timezone-derived slot.';
comment on function public.claim_delivery_personalizations is
  'Claims pending Phase 8 selection work with an expiring lease independent of the Phase 9 send lease.';
comment on function public.complete_delivery_personalization is
  'Lease-bound atomic snapshot of exact ordered verified cluster versions and scoring audit data; rejects stale preferences and repeats.';
