alter table public.subscriber_preferences
  drop constraint subscriber_preferences_story_count_check;

alter table public.subscriber_preferences
  add constraint subscriber_preferences_story_count_check check (
    cardinality(categories) between 1 and 8
    and story_count between cardinality(categories) * 2 and cardinality(categories) * 6
    and story_count % cardinality(categories) = 0
    and story_count between 2 and 48
  );

alter table public.deliveries
  drop constraint deliveries_story_count_check;

alter table public.deliveries
  add constraint deliveries_story_count_check check (
    actual_story_count is null or actual_story_count between 0 and 48
  );
