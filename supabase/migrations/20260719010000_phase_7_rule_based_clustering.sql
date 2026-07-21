-- Bulletin Phase 7 simplification: clustering is entirely deterministic.
-- The AI provider is no longer involved in article processing, candidate
-- retrieval, clustering, evidence checks, or verification. Existing vector
-- columns are removed; the provider boundary remains summary-only.

drop function if exists public.stage_article_intelligence(
  uuid, uuid, extensions.vector, text, text, jsonb, text, jsonb, text,
  timestamptz, text, text, jsonb, text[], smallint, bytea, jsonb
);
drop function if exists public.find_article_cluster_candidates(uuid, integer, integer);

create function public.stage_article_intelligence(
  p_article_id uuid,
  p_lease_token uuid,
  p_classification jsonb,
  p_classification_version text,
  p_entities jsonb,
  p_event_type text,
  p_event_time timestamptz,
  p_key_action text,
  p_key_outcome text,
  p_important_numbers jsonb,
  p_sensitive_flags text[],
  p_factual_depth smallint,
  p_event_fingerprint bytea,
  p_intelligence_metadata jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
volatile
security invoker
set search_path = ''
as $$
begin
  if jsonb_typeof(p_classification) <> 'object'
     or jsonb_typeof(p_entities) <> 'object'
     or jsonb_typeof(p_important_numbers) <> 'array'
     or jsonb_typeof(p_intelligence_metadata) <> 'object'
     or p_classification->>'category' is null
     or jsonb_typeof(p_classification->'geography') <> 'object'
     or (
       p_classification#>>'{geography,countryCode}' is not null
       and p_classification#>>'{geography,countryCode}' !~ '^[A-Z]{2}$'
     )
     or char_length(btrim(p_classification_version)) not between 1 and 80
     or p_event_type is null
     or btrim(p_event_type) = ''
     or p_factual_depth not between 0 and 3
     or octet_length(p_event_fingerprint) <> 32 then
    raise exception using errcode = '22023', message = 'invalid staged article intelligence';
  end if;

  perform (p_classification->>'category')::public.news_category;

  update public.articles
  set classification = p_classification,
      classification_version = btrim(p_classification_version),
      entities = p_entities,
      event_country_code = nullif(p_classification#>>'{geography,countryCode}', ''),
      event_state_region = nullif(btrim(p_classification#>>'{geography,stateRegion}'), ''),
      event_city = nullif(btrim(p_classification#>>'{geography,city}'), ''),
      event_type = btrim(p_event_type),
      event_time = p_event_time,
      key_action = nullif(btrim(p_key_action), ''),
      key_outcome = nullif(btrim(p_key_outcome), ''),
      important_numbers = p_important_numbers,
      sensitive_flags = coalesce(p_sensitive_flags, '{}'),
      is_sensitive = cardinality(coalesce(p_sensitive_flags, '{}')) > 0,
      factual_depth = p_factual_depth,
      event_fingerprint = p_event_fingerprint,
      intelligence_metadata = p_intelligence_metadata
  where id = p_article_id
    and lease_token = p_lease_token
    and processing_status = 'claimed'
    and duplicate_of_article_id is null;
  return found;
end;
$$;

create function public.find_article_cluster_candidates(
  p_article_id uuid,
  p_limit integer default 12,
  p_lookback_hours integer default 96
)
returns table (cluster_id uuid, rule_score double precision, cluster_snapshot jsonb)
language sql
stable
security invoker
set search_path = ''
as $$
  with subject as (
    select article.*,
      (article.classification->>'category')::public.news_category as classified_category,
      coalesce(array(
        select jsonb_array_elements_text(
          coalesce(article.classification->'topics', '[]'::jsonb)
        )
      ), '{}') as classified_topics
    from public.articles as article
    where article.id = p_article_id
      and article.processing_status = 'claimed'
      and article.classification is not null
      and article.event_type is not null
  ), scored as (
    select cluster.*,
      (
        case when cluster.event_fingerprint = subject.event_fingerprint then 100 else 0 end
        + case when cluster.event_type = subject.event_type then 25 else 0 end
        + case when cluster.category = subject.classified_category then 20 else 0 end
        + case when cluster.country_code = coalesce(subject.event_country_code, subject.country_code) then 10 else 0 end
        + case when lower(cluster.state_region) = lower(coalesce(subject.event_state_region, subject.state_region)) then 10 else 0 end
        + case when lower(cluster.city) = lower(coalesce(subject.event_city, subject.city)) then 10 else 0 end
        + least(20, 4 * coalesce((
            select count(*)::integer
            from (
              select unnest(cluster.central_topics)
              intersect
              select unnest(subject.classified_topics)
            ) as shared_topic
          ), 0))
      )::double precision as score
    from subject
    join public.story_clusters as cluster on true
    where cluster.status in ('candidate', 'open', 'verified')
      and cluster.latest_event_at >= subject.published_at
        - make_interval(hours => greatest(1, least(p_lookback_hours, 168)))
      and cluster.latest_event_at <= subject.published_at + interval '24 hours'
      and (
        cluster.category = subject.classified_category
        or (cluster.category in ('india', 'politics', 'government-schemes')
            and subject.classified_category in ('india', 'politics', 'government-schemes'))
        or (cluster.category in ('business-economy', 'markets-personal-finance', 'startups')
            and subject.classified_category in ('business-economy', 'markets-personal-finance', 'startups'))
        or (cluster.category in ('technology-ai', 'science')
            and subject.classified_category in ('technology-ai', 'science'))
      )
      and (cluster.country_code is null or coalesce(subject.event_country_code, subject.country_code) is null
           or cluster.country_code = coalesce(subject.event_country_code, subject.country_code))
      and (cluster.state_region is null or coalesce(subject.event_state_region, subject.state_region) is null
           or lower(cluster.state_region) = lower(coalesce(subject.event_state_region, subject.state_region)))
  ), candidates as (
    select * from scored
    order by score desc, latest_event_at desc, id
    limit greatest(1, least(p_limit, 20))
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

create or replace function public.commit_article_to_story_cluster(
  p_article_id uuid,
  p_lease_token uuid,
  p_preferred_cluster_id uuid,
  p_decision_method text,
  p_decision_metadata jsonb,
  p_is_meaningful_update boolean,
  p_has_material_conflict boolean,
  p_conflict_details jsonb,
  p_evidence_duplicate_of_article_id uuid default null,
  p_evidence_duplicate_kind text default null,
  p_verification_version text default 'phase-7-v1',
  p_now timestamptz default statement_timestamp()
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  article_record public.articles%rowtype;
  source_record public.sources%rowtype;
  duplicate_record public.articles%rowtype;
  cluster_record public.story_clusters%rowtype;
  target_cluster_id uuid;
  accepted_before integer;
  introduced_version integer;
  independence_key bytea;
  independent_count integer;
  reliable_count integer;
  noninstitutional_count integer;
  institutional_count integer;
  single_source_eligible boolean;
  resulting_strength public.evidence_strength;
  resulting_status public.story_cluster_status;
  summary_queued boolean := false;
begin
  if char_length(btrim(p_decision_method)) not between 1 and 100
     or p_decision_metadata is null
     or jsonb_typeof(p_decision_metadata) <> 'object'
     or p_conflict_details is null
     or jsonb_typeof(p_conflict_details) <> 'array'
     or char_length(btrim(p_verification_version)) not between 1 and 80 then
    raise exception using errcode = '22023', message = 'invalid cluster commit metadata';
  end if;

  select * into article_record
  from public.articles
  where id = p_article_id
    and lease_token = p_lease_token
    and processing_status = 'claimed'
    and duplicate_of_article_id is null
  for update;
  if not found then
    raise exception using errcode = '55000', message = 'active article lease required';
  end if;
  if article_record.classification is null
     or article_record.entities is null
     or article_record.event_type is null
     or article_record.event_fingerprint is null
     or article_record.factual_depth is null then
    raise exception using errcode = '55000', message = 'staged article intelligence required';
  end if;

  select * into source_record from public.sources where id = article_record.source_id;

  if p_evidence_duplicate_of_article_id is not null then
    select * into duplicate_record
    from public.articles
    where id = p_evidence_duplicate_of_article_id and id <> p_article_id;
    if not found
       or duplicate_record.evidence_independence_key is null
       or duplicate_record.source_id = article_record.source_id
       or p_evidence_duplicate_kind not in ('cross-source-exact', 'cross-source-near') then
      raise exception using errcode = '22023', message = 'invalid cross-source duplicate provenance';
    end if;
    independence_key := duplicate_record.evidence_independence_key;
  elsif p_evidence_duplicate_kind is not null then
    raise exception using errcode = '22023', message = 'duplicate kind requires evidence target';
  else
    independence_key := extensions.digest(
      'publisher-family:' || source_record.publisher_family_key,
      'sha256'
    );
  end if;

  if p_preferred_cluster_id is not null then
    select * into cluster_record
    from public.story_clusters
    where id = p_preferred_cluster_id and status <> 'quarantined'
    for update;
    if not found then
      raise exception using errcode = '55000', message = 'eligible preferred cluster required';
    end if;
  else
    select * into cluster_record
    from public.story_clusters
    where event_fingerprint = article_record.event_fingerprint
      and status <> 'quarantined'
    for update;
  end if;

  if cluster_record.id is null then
    begin
      insert into public.story_clusters (
        status, category, country_code, state_region, city, central_topics,
        entities, evidence_strength, is_sensitive, current_version,
        latest_event_at, event_type, event_time, key_action, key_outcome,
        important_numbers, event_fingerprint, verification_version,
        evidence_result
      ) values (
        'open', (article_record.classification->>'category')::public.news_category,
        coalesce(article_record.event_country_code, article_record.country_code),
        coalesce(article_record.event_state_region, article_record.state_region),
        coalesce(article_record.event_city, article_record.city),
        coalesce(array(
          select jsonb_array_elements_text(
            coalesce(article_record.classification->'topics', '[]'::jsonb)
          )
        ), '{}'),
        article_record.entities, 'weak', article_record.is_sensitive, 1,
        coalesce(article_record.event_time, article_record.published_at),
        article_record.event_type, article_record.event_time,
        article_record.key_action, article_record.key_outcome,
        article_record.important_numbers, article_record.event_fingerprint,
        p_verification_version,
        jsonb_build_object('policyVersion', 'phase-7-local-v3')
      )
      returning * into cluster_record;
    exception when unique_violation then
      select * into cluster_record
      from public.story_clusters
      where event_fingerprint = article_record.event_fingerprint
        and status <> 'quarantined'
      for update;
      if not found then raise; end if;
    end;
  end if;

  target_cluster_id := cluster_record.id;
  select count(*)::integer into accepted_before
  from public.story_cluster_articles
  where cluster_id = target_cluster_id and decision = 'accepted';

  introduced_version := cluster_record.current_version
    + case when accepted_before > 0 and p_is_meaningful_update then 1 else 0 end;

  update public.articles
  set evidence_independence_key = independence_key,
      evidence_duplicate_of_article_id = p_evidence_duplicate_of_article_id,
      evidence_duplicate_kind = p_evidence_duplicate_kind
  where id = p_article_id;

  insert into public.story_cluster_articles (
    cluster_id, article_id, decision, decision_method,
    decision_metadata, added_in_version
  ) values (
    target_cluster_id, p_article_id, 'accepted', btrim(p_decision_method),
    p_decision_metadata || jsonb_build_object(
      'policyVersion', 'phase-7-local-v3',
      'ruleBasedCandidateProposed', p_preferred_cluster_id is not null
    ),
    introduced_version
  )
  on conflict (cluster_id, article_id) do nothing;

  select
    count(distinct article.evidence_independence_key)::integer,
    count(distinct article.evidence_independence_key) filter (
      where source.reliability in ('tier-1', 'tier-2') and not source.is_aggregator
    )::integer,
    count(distinct article.evidence_independence_key) filter (
      where source.reliability in ('tier-1', 'tier-2')
        and not source.is_aggregator and not source.is_institutional
    )::integer,
    count(distinct article.evidence_independence_key) filter (
      where source.reliability in ('tier-1', 'tier-2')
        and not source.is_aggregator and source.is_institutional
    )::integer,
    bool_or(
      source.reliability in ('tier-1', 'tier-2')
      and not source.is_aggregator and article.factual_depth >= 2
    )
  into independent_count, reliable_count, noninstitutional_count,
       institutional_count, single_source_eligible
  from public.story_cluster_articles as relation
  join public.articles as article on article.id = relation.article_id
  join public.sources as source on source.id = article.source_id
  where relation.cluster_id = target_cluster_id and relation.decision = 'accepted';

  if p_has_material_conflict then
    resulting_strength := 'conflicted';
    resulting_status := 'conflicted';
  elsif cluster_record.is_sensitive or article_record.is_sensitive then
    resulting_strength := case
      when noninstitutional_count >= 3 or (institutional_count >= 1 and noninstitutional_count >= 2)
        then 'strong'::public.evidence_strength
      when noninstitutional_count >= 2 or (institutional_count >= 1 and noninstitutional_count >= 1)
        then 'sufficient'::public.evidence_strength
      else 'weak'::public.evidence_strength
    end;
    resulting_status := case
      when resulting_strength in ('sufficient', 'strong') then 'verified'::public.story_cluster_status
      else 'open'::public.story_cluster_status
    end;
  else
    resulting_strength := case
      when reliable_count >= 3 or (institutional_count >= 1 and noninstitutional_count >= 2)
        then 'strong'::public.evidence_strength
      when reliable_count >= 2 or coalesce(single_source_eligible, false)
        then 'sufficient'::public.evidence_strength
      else 'weak'::public.evidence_strength
    end;
    resulting_status := case
      when resulting_strength in ('sufficient', 'strong') then 'verified'::public.story_cluster_status
      else 'open'::public.story_cluster_status
    end;
  end if;

  update public.story_clusters
  set status = resulting_status,
      evidence_strength = resulting_strength,
      evidence_independence_count = independent_count,
      evidence_result = jsonb_build_object(
        'policyVersion', 'phase-7-local-v3',
        'independentEvidenceUnits', independent_count,
        'reliableIndependentUnits', reliable_count,
        'nonInstitutionalIndependentUnits', noninstitutional_count,
        'institutionalIndependentUnits', institutional_count,
        'singleSourceEligible', coalesce(single_source_eligible, false),
        'sensitivePolicyApplied', cluster_record.is_sensitive or article_record.is_sensitive
      ),
      conflict_details = case when p_has_material_conflict then p_conflict_details else conflict_details end,
      is_sensitive = is_sensitive or article_record.is_sensitive,
      current_version = introduced_version,
      latest_event_at = greatest(latest_event_at, coalesce(article_record.event_time, article_record.published_at)),
      event_type = case when accepted_before = 0 or p_is_meaningful_update then article_record.event_type else event_type end,
      event_time = case when accepted_before = 0 or p_is_meaningful_update then article_record.event_time else event_time end,
      key_action = case when accepted_before = 0 or p_is_meaningful_update then article_record.key_action else key_action end,
      key_outcome = case when accepted_before = 0 or p_is_meaningful_update then article_record.key_outcome else key_outcome end,
      important_numbers = case when accepted_before = 0 or p_is_meaningful_update then article_record.important_numbers else important_numbers end,
      entities = case when accepted_before = 0 or p_is_meaningful_update then article_record.entities else entities end,
      central_topics = case when accepted_before = 0 or p_is_meaningful_update then
        coalesce(array(
          select jsonb_array_elements_text(
            coalesce(article_record.classification->'topics', '[]'::jsonb)
          )
        ), '{}')
        else central_topics end,
      verified_at = case
        when resulting_status = 'verified' then coalesce(verified_at, p_now)
        else null
      end,
      verification_version = p_verification_version,
      summary_due_at = case when resulting_status = 'verified' then p_now else null end
  where id = target_cluster_id;

  if resulting_status = 'verified' then
    insert into public.cluster_summaries (
      cluster_id, cluster_version, language, status, next_attempt_at
    ) values (
      target_cluster_id, introduced_version, 'en', 'pending', p_now
    )
    on conflict (cluster_id, cluster_version, language) do nothing;
    summary_queued := found;
  else
    update public.cluster_summaries
    set status = case
          when resulting_status = 'conflicted' then 'conflicting-evidence'::public.summary_status
          else 'insufficient-evidence'::public.summary_status
        end,
        lease_token = null,
        lease_owner = null,
        lease_expires_at = null,
        last_error_code = case
          when resulting_status = 'conflicted' then 'cluster-conflicted'
          else 'cluster-insufficient-evidence'
        end
    where cluster_id = target_cluster_id
      and cluster_version = introduced_version
      and status in ('pending', 'generating', 'retry-wait');
  end if;

  update public.articles
  set processing_status = 'processed',
      processed_at = p_now,
      next_processing_at = p_now,
      last_error_code = null,
      lease_token = null,
      lease_owner = null,
      lease_expires_at = null
  where id = p_article_id and lease_token = p_lease_token;
  if not found then
    raise exception using errcode = '55000', message = 'article lease lost during cluster commit';
  end if;

  return jsonb_build_object(
    'clusterId', target_cluster_id,
    'clusterVersion', introduced_version,
    'clusterStatus', resulting_status,
    'evidenceStrength', resulting_strength,
    'independentEvidenceUnits', independent_count,
    'meaningfulUpdate', accepted_before > 0 and p_is_meaningful_update,
    'summaryQueued', summary_queued
  );
end;
$$;

revoke execute on function public.stage_article_intelligence(
  uuid, uuid, jsonb, text, jsonb, text, timestamptz, text, text, jsonb,
  text[], smallint, bytea, jsonb
) from public, anon, authenticated;
grant execute on function public.stage_article_intelligence(
  uuid, uuid, jsonb, text, jsonb, text, timestamptz, text, text, jsonb,
  text[], smallint, bytea, jsonb
) to service_role;
revoke execute on function public.find_article_cluster_candidates(uuid, integer, integer)
  from public, anon, authenticated;
grant execute on function public.find_article_cluster_candidates(uuid, integer, integer)
  to service_role;

drop index if exists public.articles_embedding_hnsw_idx;
drop index if exists public.story_clusters_embedding_hnsw_idx;
alter table public.articles drop constraint if exists articles_embedding_provenance_check;
alter table public.articles
  drop column if exists embedding_provider,
  drop column if exists embedding_dimensions,
  drop column if exists embedding_model,
  drop column if exists embedding;
alter table public.story_clusters drop column if exists representative_embedding;
drop extension if exists vector;

delete from bulletin_private.ai_provider_usage_windows
where task_kind not in ('summarization', 'localization');
alter table bulletin_private.ai_provider_usage_windows
  drop constraint if exists ai_provider_usage_task_check,
  add constraint ai_provider_usage_task_check check (
    task_kind in ('summarization', 'localization')
  );

comment on function public.find_article_cluster_candidates is
  'Returns at most 20 recent category, time, topic, and geography-compatible clusters ranked by explicit local rules. It makes no AI call and never authorizes a merge by itself.';
comment on function public.commit_article_to_story_cluster is
  'Lease-bound local article completion, deterministic clustering, publisher-family evidence, versioning, and canonical summary enqueue in one transaction.';
