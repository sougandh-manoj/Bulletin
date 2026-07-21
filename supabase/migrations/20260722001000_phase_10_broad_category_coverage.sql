-- Bulletin Phase 10: broaden briefings to three or four stories per category.

begin;

alter table public.subscriber_preferences
  drop constraint subscriber_preferences_story_count_check;
alter table public.deliveries
  drop constraint deliveries_story_count_check;
alter table public.delivery_stories
  drop constraint delivery_stories_position_check;

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
where preference.story_count < cardinality(preference.categories) * 3
   or preference.story_count > cardinality(preference.categories) * 4
on conflict (subscriber_id, version) do nothing;

update public.subscriber_preferences
set story_count = least(
      cardinality(categories) * 4,
      greatest(cardinality(categories) * 3, story_count)
    ),
    version = version + 1,
    updated_at = statement_timestamp()
where story_count < cardinality(categories) * 3
   or story_count > cardinality(categories) * 4;

alter table public.subscriber_preferences
  add constraint subscriber_preferences_story_count_check check (
    story_count between cardinality(categories) * 3 and cardinality(categories) * 4
    and story_count between 3 and 32
  );
alter table public.deliveries
  add constraint deliveries_story_count_check check (
    actual_story_count is null or actual_story_count between 0 and 32
  );
alter table public.delivery_stories
  add constraint delivery_stories_position_check check (position between 1 and 32);

update public.articles
set classification = jsonb_set(classification, '{category}', '"health"'::jsonb, true),
    updated_at = statement_timestamp()
where classification is not null
  and concat_ws(' ', original_title, description)
    ~* '\m(veterinary|medicine|transfusions?|stem cells?)\M';

update public.story_clusters as cluster
set category = 'health'::public.news_category,
    updated_at = statement_timestamp()
where exists (
  select 1
  from public.story_cluster_articles as relation
  join public.articles as article on article.id = relation.article_id
  where relation.cluster_id = cluster.id
    and relation.decision = 'accepted'
    and article.classification->>'category' = 'health'
);

commit;
