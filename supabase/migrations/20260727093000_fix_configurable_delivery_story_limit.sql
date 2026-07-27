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
  if jsonb_array_length(p_selected_stories) > delivery_record.story_count then
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

comment on function public.complete_delivery_personalization is
  'Finalizes a personalization lease while respecting the subscriber preference total, including configurable per-category totals up to 48.';
