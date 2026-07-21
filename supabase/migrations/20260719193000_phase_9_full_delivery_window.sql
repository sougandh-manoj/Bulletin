-- A same-day schedule or preference change must not collapse the news window
-- to the few hours since the previous email. Always use the frequency's full
-- rolling window; delivery history already prevents a story version from
-- being sent twice.
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
      next_at := public.compute_next_delivery_at(
        due_record.next_delivery_at,
        due_record.frequency,
        due_record.weekly_day,
        due_record.local_delivery_time,
        due_record.timezone
      );
      window_start := public.compute_delivery_window_start(
        due_record.next_delivery_at,
        due_record.frequency,
        due_record.weekly_day,
        due_record.local_delivery_time,
        due_record.timezone
      );

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

comment on function public.enqueue_due_deliveries(integer, timestamptz) is
  'Creates due delivery slots with the full frequency window; prior delivered story versions are excluded during personalization instead of shrinking same-day windows.';

revoke execute on function public.enqueue_due_deliveries(integer, timestamptz)
  from public, anon, authenticated;
grant execute on function public.enqueue_due_deliveries(integer, timestamptz)
  to service_role;

