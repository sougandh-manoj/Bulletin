-- Bulletin Phase 10: title-only duplicate grouping and single-story eligibility.

begin;

create or replace function bulletin_private.title_similarity(
  p_left text,
  p_right text
)
returns double precision
language plpgsql
immutable
strict
set search_path = ''
as $$
declare
  left_value text;
  right_value text;
  left_tokens text[];
  right_tokens text[];
  shared_count integer;
  dice_score double precision;
  containment_score double precision;
begin
  left_value := btrim(regexp_replace(lower(p_left), '[^[:alnum:]]+', ' ', 'g'));
  right_value := btrim(regexp_replace(lower(p_right), '[^[:alnum:]]+', ' ', 'g'));
  if left_value = '' or right_value = '' then return 0; end if;
  if left_value = right_value then return 1; end if;

  select coalesce(array_agg(distinct token), '{}') into left_tokens
  from unnest(regexp_split_to_array(left_value, '\s+')) as token
  where char_length(token) >= 3
    and token <> all(array[
      'about','after','again','also','among','and','before','being','breaking','exclusive','explained','from','have','into',
      'latest','live','more','news','over','photos','report','says','than','that','their','there','these','this','through',
      'today','under','update','video','what','when','where','which','while','why','will','with','would',
      'अब','और','का','की','के','को','क्या','क्यों','ने','पर','में','यह','से','है','हैं','हुआ','हुई','लिए',
      'അത്','ഒരു','എന്ന','എന്ന്','ഈ','കൂടി','ചെയ്തു','നിന്ന്','മുതൽ','വരെ'
    ]);
  select coalesce(array_agg(distinct token), '{}') into right_tokens
  from unnest(regexp_split_to_array(right_value, '\s+')) as token
  where char_length(token) >= 3
    and token <> all(array[
      'about','after','again','also','among','and','before','being','breaking','exclusive','explained','from','have','into',
      'latest','live','more','news','over','photos','report','says','than','that','their','there','these','this','through',
      'today','under','update','video','what','when','where','which','while','why','will','with','would',
      'अब','और','का','की','के','को','क्या','क्यों','ने','पर','में','यह','से','है','हैं','हुआ','हुई','लिए',
      'അത്','ഒരു','എന്ന','എന്ന്','ഈ','കൂടി','ചെയ്തു','നിന്ന്','മുതൽ','വരെ'
    ]);

  if least(cardinality(left_tokens), cardinality(right_tokens)) < 3 then return 0; end if;
  select count(*)::integer into shared_count
  from (select unnest(left_tokens) intersect select unnest(right_tokens)) as shared;
  if shared_count < 3 then return 0; end if;
  dice_score := (2.0 * shared_count) / (cardinality(left_tokens) + cardinality(right_tokens));
  containment_score := (shared_count::double precision / least(cardinality(left_tokens), cardinality(right_tokens))) * 0.92;
  return greatest(dice_score, containment_score);
end;
$$;

create or replace function public.find_article_cluster_candidates(
  p_article_id uuid,
  p_limit integer default 20,
  p_lookback_hours integer default 96
)
returns table (cluster_id uuid, rule_score double precision, cluster_snapshot jsonb)
language sql
stable
security invoker
set search_path = ''
as $$
  with subject as (
    select article.id, article.normalized_title, article.published_at
    from public.articles as article
    where article.id = p_article_id
      and article.processing_status = 'claimed'
      and article.classification is not null
  ), scored as (
    select cluster.id,
           max(bulletin_private.title_similarity(subject.normalized_title, article.normalized_title)) as score
    from subject
    join public.story_clusters as cluster
      on cluster.status in ('candidate', 'open', 'verified')
     and cluster.latest_event_at >= subject.published_at - make_interval(hours => greatest(1, least(p_lookback_hours, 168)))
     and cluster.latest_event_at <= subject.published_at + interval '24 hours'
    join public.story_cluster_articles as relation
      on relation.cluster_id = cluster.id and relation.decision = 'accepted'
    join public.articles as article on article.id = relation.article_id
    where article.id <> subject.id
    group by cluster.id
  ), candidates as (
    select cluster.*, scored.score
    from scored
    join public.story_clusters as cluster on cluster.id = scored.id
    where scored.score >= 0.35
    order by scored.score desc, cluster.latest_event_at desc, cluster.id
    limit greatest(1, least(p_limit, 100))
  )
  select candidate.id,
         candidate.score,
         jsonb_build_object(
           'id', candidate.id,
           'status', candidate.status,
           'category', candidate.category,
           'countryCode', candidate.country_code,
           'stateRegion', candidate.state_region,
           'city', candidate.city,
           'centralTopics', candidate.central_topics,
           'entities', candidate.entities,
           'eventType', candidate.event_type,
           'eventTime', candidate.event_time,
           'keyAction', candidate.key_action,
           'keyOutcome', candidate.key_outcome,
           'importantNumbers', candidate.important_numbers,
           'isSensitive', candidate.is_sensitive,
           'currentVersion', candidate.current_version,
           'latestEventAt', candidate.latest_event_at,
           'evidenceArticles', coalesce(evidence.items, '[]'::jsonb)
         )
  from candidates as candidate
  left join lateral (
    select jsonb_agg(item.payload order by item.published_at desc, item.article_id) as items
    from (
      select article.id as article_id,
             article.published_at,
             jsonb_build_object(
               'id', article.id,
               'title', article.original_title,
               'description', article.description,
               'canonicalUrl', article.canonical_url,
               'publishedAt', article.published_at,
               'language', article.declared_language,
               'countryCode', coalesce(article.event_country_code, article.country_code),
               'stateRegion', coalesce(article.event_state_region, article.state_region),
               'city', coalesce(article.event_city, article.city),
               'classification', article.classification,
               'entities', article.entities,
               'eventType', article.event_type,
               'eventTime', article.event_time,
               'keyAction', article.key_action,
               'keyOutcome', article.key_outcome,
               'importantNumbers', article.important_numbers,
               'publisherName', source.publisher_name,
               'publisherFamilyKey', source.publisher_family_key,
               'reliability', source.reliability,
               'isAggregator', source.is_aggregator,
               'isInstitutional', source.is_institutional
             ) as payload
      from public.story_cluster_articles as relation
      join public.articles as article on article.id = relation.article_id
      join public.sources as source on source.id = article.source_id
      where relation.cluster_id = candidate.id and relation.decision = 'accepted'
      order by article.published_at desc, article.id
      limit 12
    ) as item
  ) as evidence on true
  order by candidate.score desc, candidate.latest_event_at desc, candidate.id;
$$;

create or replace function public.promote_title_story_cluster(
  p_cluster_id uuid,
  p_now timestamptz default statement_timestamp()
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  cluster_record public.story_clusters%rowtype;
  independent_count integer;
  summary_queued boolean := false;
begin
  select * into cluster_record from public.story_clusters
  where id = p_cluster_id for update;
  if not found then
    raise exception using errcode = '55000', message = 'title-story-cluster-missing';
  end if;

  select count(distinct article.evidence_independence_key)::integer
  into independent_count
  from public.story_cluster_articles as relation
  join public.articles as article on article.id = relation.article_id
  where relation.cluster_id = p_cluster_id and relation.decision = 'accepted';
  if independent_count < 1 then
    raise exception using errcode = '55000', message = 'title-story-evidence-missing';
  end if;

  update public.story_clusters
  set status = 'verified',
      evidence_strength = 'sufficient',
      evidence_independence_count = independent_count,
      evidence_result = jsonb_build_object(
        'policyVersion', 'title-only-v1',
        'titleDeduplicationOnly', true,
        'independentEvidenceUnits', independent_count
      ),
      conflict_details = '[]'::jsonb,
      verified_at = coalesce(verified_at, p_now),
      verification_version = 'title-only-v1',
      summary_due_at = p_now
  where id = p_cluster_id;

  insert into public.cluster_summaries (
    cluster_id, cluster_version, language, status, next_attempt_at
  ) values (
    p_cluster_id, cluster_record.current_version, 'en', 'pending', p_now
  ) on conflict (cluster_id, cluster_version, language) do nothing;
  summary_queued := found;

  return jsonb_build_object(
    'clusterId', p_cluster_id,
    'clusterVersion', cluster_record.current_version,
    'clusterStatus', 'verified',
    'evidenceStrength', 'sufficient',
    'independentEvidenceUnits', independent_count,
    'meaningfulUpdate', false,
    'summaryQueued', summary_queued
  );
end;
$$;

revoke execute on function bulletin_private.title_similarity(text, text) from public, anon, authenticated;
grant execute on function bulletin_private.title_similarity(text, text) to service_role;
revoke execute on function public.promote_title_story_cluster(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.promote_title_story_cluster(uuid, timestamptz) to service_role;

comment on function public.find_article_cluster_candidates(uuid, integer, integer) is
  'Returns recent candidate clusters ranked only by normalized title similarity.';
comment on function public.promote_title_story_cluster(uuid, timestamptz) is
  'Makes each valid title-deduplicated story summary-eligible without cross-source confirmation.';

commit;
