-- Bulletin Phase 10: make the briefing target exactly four stories per category.

begin;

alter table public.subscriber_preferences
  drop constraint subscriber_preferences_story_count_check;

insert into public.preference_versions (
  subscriber_id, version, reason, snapshot, retain_until
)
select
  preference.subscriber_id,
  preference.version,
  'recovery'::public.preference_change_reason,
  bulletin_private.preference_snapshot(preference.subscriber_id),
  statement_timestamp() + interval '30 days'
from public.subscriber_preferences as preference
where preference.story_count <> cardinality(preference.categories) * 4
on conflict (subscriber_id, version) do nothing;

update public.subscriber_preferences
set story_count = cardinality(categories) * 4,
    version = version + 1,
    updated_at = statement_timestamp()
where story_count <> cardinality(categories) * 4;

alter table public.subscriber_preferences
  add constraint subscriber_preferences_story_count_check check (
    story_count = cardinality(categories) * 4
    and story_count between 4 and 32
  );

commit;
