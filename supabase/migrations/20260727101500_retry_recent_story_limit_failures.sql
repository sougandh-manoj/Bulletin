with recent_failure as (
  select distinct on (delivery.subscriber_id)
    delivery.id
  from public.deliveries as delivery
  join public.subscribers as subscriber
    on subscriber.id = delivery.subscriber_id
  where delivery.status = 'pending'
    and delivery.personalization_status = 'failed'
    and delivery.personalization_failure_code = '22023'
    and delivery.sent_at is null
    and delivery.smtp_accepted_at is null
    and delivery.scheduled_for >= statement_timestamp() - interval '24 hours'
    and subscriber.status = 'active'
    and subscriber.verified_at is not null
  order by delivery.subscriber_id, delivery.scheduled_for desc
)
update public.deliveries as delivery
set personalization_status = 'pending',
    personalization_attempt_count = 0,
    next_personalization_at = statement_timestamp(),
    personalization_lease_token = null,
    personalization_lease_owner = null,
    personalization_lease_expires_at = null,
    personalization_failure_code = null,
    actual_story_count = null,
    updated_at = statement_timestamp()
from recent_failure
where delivery.id = recent_failure.id;
