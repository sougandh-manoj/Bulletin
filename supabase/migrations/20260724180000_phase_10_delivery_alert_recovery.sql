create or replace function public.resolve_operational_alert(
  p_deduplication_key text,
  p_now timestamptz default statement_timestamp()
)
returns boolean
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  resolved boolean;
begin
  if char_length(btrim(p_deduplication_key)) not between 1 and 200 then
    raise exception using errcode = '22023', message = 'invalid operational alert key';
  end if;

  update public.alert_events
  set status = 'resolved', resolved_at = p_now
  where deduplication_key = p_deduplication_key
    and status = 'open'
  returning true into resolved;

  return coalesce(resolved, false);
end;
$$;

create or replace function public.record_consecutive_operational_alert(
  p_deduplication_key text,
  p_critical_after integer,
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
  next_occurrence_count integer;
  next_severity public.alert_severity;
  should_notify boolean := false;
begin
  if char_length(btrim(p_deduplication_key)) not between 1 and 200
     or char_length(btrim(p_title)) not between 1 and 300
     or jsonb_typeof(p_safe_details) <> 'object'
     or p_critical_after not between 1 and 100 then
    raise exception using errcode = '22023', message = 'invalid consecutive operational alert';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_deduplication_key, 0));

  select * into alert_record
  from public.alert_events
  where deduplication_key = p_deduplication_key
  for update;

  if not found then
    next_occurrence_count := 1;
    next_severity := case
      when next_occurrence_count >= p_critical_after then 'critical'::public.alert_severity
      else 'warning'::public.alert_severity
    end;
    insert into public.alert_events (
      deduplication_key, severity, title, safe_details,
      first_seen_at, last_seen_at, occurrence_count,
      last_notified_at, notification_count
    ) values (
      p_deduplication_key, next_severity, p_title, p_safe_details,
      p_now, p_now, next_occurrence_count,
      case when next_severity = 'critical' then p_now else null end,
      case when next_severity = 'critical' then 1 else 0 end
    );
    return next_severity = 'critical';
  end if;

  next_occurrence_count := case
    when alert_record.status = 'resolved' then 1
    else alert_record.occurrence_count + 1
  end;
  next_severity := case
    when next_occurrence_count >= p_critical_after then 'critical'::public.alert_severity
    else 'warning'::public.alert_severity
  end;
  should_notify := next_severity = 'critical'
    and (
      alert_record.status = 'resolved'
      or alert_record.last_notified_at is null
      or alert_record.last_notified_at <= p_now - interval '6 hours'
    );

  update public.alert_events
  set status = 'open',
      severity = next_severity,
      title = p_title,
      safe_details = p_safe_details,
      first_seen_at = case when alert_record.status = 'resolved' then p_now else first_seen_at end,
      last_seen_at = p_now,
      occurrence_count = next_occurrence_count,
      resolved_at = null,
      last_notified_at = case when should_notify then p_now else last_notified_at end,
      notification_count = notification_count + case when should_notify then 1 else 0 end
  where id = alert_record.id;

  return should_notify;
end;
$$;

revoke execute on function public.resolve_operational_alert(text, timestamptz) from public, anon, authenticated;
revoke execute on function public.record_consecutive_operational_alert(text, integer, text, jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.resolve_operational_alert(text, timestamptz) to service_role;
grant execute on function public.record_consecutive_operational_alert(text, integer, text, jsonb, timestamptz) to service_role;
