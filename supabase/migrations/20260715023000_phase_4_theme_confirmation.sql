-- Bulletin Phase 4 follow-up: combine the subscriber's first theme choice with
-- deliberate verification so the standalone confirmation screen is unnecessary.

create or replace function public.consume_verification_token_with_theme(
  p_token_hash bytea,
  p_theme public.briefing_theme,
  p_now timestamptz default statement_timestamp()
)
returns table (subscriber_public_reference uuid, next_delivery_at timestamptz)
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  consumed record;
  selected_subscriber_id uuid;
begin
  if octet_length(p_token_hash) <> 32 or p_theme is null then
    raise exception using errcode = '22023', message = 'invalid verification selection';
  end if;

  select * into consumed
  from public.consume_verification_token(p_token_hash, p_now);

  select subscriber.id into selected_subscriber_id
  from public.subscribers as subscriber
  where subscriber.public_reference = consumed.subscriber_public_reference;

  update public.subscriber_preferences as preference
  set theme = p_theme
  where preference.subscriber_id = selected_subscriber_id;

  if not found then
    raise exception using errcode = '55000', message = 'subscriber preferences unavailable';
  end if;

  return query
  select consumed.subscriber_public_reference, consumed.next_delivery_at;
end;
$$;

revoke execute on function public.consume_verification_token_with_theme(
  bytea, public.briefing_theme, timestamptz
) from public, anon, authenticated;

grant execute on function public.consume_verification_token_with_theme(
  bytea, public.briefing_theme, timestamptz
) to service_role;

comment on function public.consume_verification_token_with_theme is
  'Atomically consumes one verification token, activates delivery, and stores the subscriber first theme selection.';
