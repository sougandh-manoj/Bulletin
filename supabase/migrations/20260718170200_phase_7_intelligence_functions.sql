-- Bulletin Phase 7: bounded provider quotas, article intelligence staging,
-- semantic candidate proposals, atomic event clustering, and resumable shared
-- summary/localization claims. All functions are service-role-only.

create or replace function public.reserve_ai_provider_usage(
  p_provider text,
  p_model text,
  p_task_kind text,
  p_estimated_input_units integer,
  p_requests_per_minute integer,
  p_units_per_minute integer,
  p_requests_per_day integer,
  p_units_per_day integer,
  p_verification_request_reserve integer default 0,
  p_verification_unit_reserve integer default 0,
  p_now timestamptz default statement_timestamp()
)
returns table (allowed boolean, retry_at timestamptz, reason text)
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  minute_start timestamptz := date_trunc('minute', p_now);
  day_start timestamptz := date_trunc('day', p_now at time zone 'UTC') at time zone 'UTC';
  minute_requests integer;
  minute_units bigint;
  day_requests integer;
  day_units bigint;
  effective_day_requests integer;
  effective_day_units bigint;
begin
  if p_task_kind not in (
    'embedding', 'classification', 'cluster-verification',
    'summarization', 'localization', 'final-verification'
  ) then
    raise exception using errcode = '22023', message = 'unknown provider task kind';
  end if;
  if char_length(btrim(p_provider)) not between 1 and 80
     or char_length(btrim(p_model)) not between 1 and 120
     or p_estimated_input_units < 0
     or p_requests_per_minute < 1
     or p_units_per_minute < 1
     or p_requests_per_day < 1
     or p_units_per_day < 1
     or p_verification_request_reserve < 0
     or p_verification_request_reserve >= p_requests_per_day
     or p_verification_unit_reserve < 0
     or p_verification_unit_reserve >= p_units_per_day then
    raise exception using errcode = '22023', message = 'invalid provider quota inputs';
  end if;

  -- Serialize one provider/model quota decision across stateless workers.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_provider || ':' || p_model, 0)
  );

  with expired as (
    select provider, model, task_kind, window_kind, window_started_at
    from bulletin_private.ai_provider_usage_windows
    where expires_at <= p_now
    order by expires_at
    limit 1000
  )
  delete from bulletin_private.ai_provider_usage_windows as usage
  using expired
  where usage.provider = expired.provider
    and usage.model = expired.model
    and usage.task_kind = expired.task_kind
    and usage.window_kind = expired.window_kind
    and usage.window_started_at = expired.window_started_at;

  select coalesce(sum(request_count), 0)::integer,
         coalesce(sum(estimated_input_units), 0)
  into minute_requests, minute_units
  from bulletin_private.ai_provider_usage_windows
  where provider = p_provider and model = p_model
    and window_kind = 'minute' and window_started_at = minute_start;

  select coalesce(sum(request_count), 0)::integer,
         coalesce(sum(estimated_input_units), 0)
  into day_requests, day_units
  from bulletin_private.ai_provider_usage_windows
  where provider = p_provider and model = p_model
    and window_kind = 'day' and window_started_at = day_start;

  effective_day_requests := case
    when p_task_kind = 'final-verification' then p_requests_per_day
    else greatest(1, p_requests_per_day - p_verification_request_reserve)
  end;
  effective_day_units := case
    when p_task_kind = 'final-verification' then p_units_per_day
    else greatest(1, p_units_per_day - p_verification_unit_reserve)
  end;

  if minute_requests + 1 > p_requests_per_minute
     or minute_units + p_estimated_input_units > p_units_per_minute then
    return query select false, minute_start + interval '1 minute', 'minute-quota'::text;
    return;
  end if;
  if day_requests + 1 > effective_day_requests
     or day_units + p_estimated_input_units > effective_day_units then
    return query select false, day_start + interval '1 day',
      case when p_task_kind = 'final-verification' then 'daily-quota' else 'verification-reserve' end;
    return;
  end if;

  insert into bulletin_private.ai_provider_usage_windows (
    provider, model, task_kind, window_kind, window_started_at,
    request_count, estimated_input_units, expires_at, updated_at
  ) values
    (p_provider, p_model, p_task_kind, 'minute', minute_start,
     1, p_estimated_input_units, minute_start + interval '2 minutes', p_now),
    (p_provider, p_model, p_task_kind, 'day', day_start,
     1, p_estimated_input_units, day_start + interval '2 days', p_now)
  on conflict (provider, model, task_kind, window_kind, window_started_at)
  do update set
    request_count = bulletin_private.ai_provider_usage_windows.request_count + 1,
    estimated_input_units = bulletin_private.ai_provider_usage_windows.estimated_input_units
      + excluded.estimated_input_units,
    updated_at = p_now;

  return query select true, null::timestamptz, null::text;
end;
$$;

create or replace function public.claim_articles(
  p_worker_id uuid,
  p_batch_size integer default 10,
  p_lease_seconds integer default 180,
  p_now timestamptz default statement_timestamp()
)
returns table (article_id uuid, lease_token uuid)
language sql
volatile
security invoker
set search_path = ''
as $$
  with candidates as (
    select article.id
    from public.articles as article
    where article.processing_status in ('pending', 'retry-wait', 'claimed')
      and article.duplicate_of_article_id is null
      and article.duplicate_kind is null
      and (
        (article.processing_status in ('pending', 'retry-wait') and article.next_processing_at <= p_now)
        or (article.processing_status = 'claimed' and article.lease_expires_at <= p_now)
      )
      and article.processing_attempts < 5
      and (article.lease_expires_at is null or article.lease_expires_at <= p_now)
    order by article.next_processing_at, article.published_at, article.id
    for update skip locked
    limit greatest(1, least(p_batch_size, 25))
  ), claimed as (
    update public.articles as article
    set processing_status = 'claimed',
        processing_attempts = processing_attempts + 1,
        lease_token = gen_random_uuid(),
        lease_owner = p_worker_id,
        lease_expires_at = p_now + make_interval(secs => greatest(60, least(p_lease_seconds, 900)))
    from candidates
    where article.id = candidates.id
    returning article.id, article.lease_token
  )
  select id, claimed.lease_token from claimed;
$$;

create or replace function public.stage_article_intelligence(
  p_article_id uuid,
  p_lease_token uuid,
  p_embedding extensions.vector(768),
  p_embedding_provider text,
  p_embedding_model text,
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
  if p_embedding is null
     or extensions.vector_dims(p_embedding) <> 768
     or char_length(btrim(p_embedding_provider)) not between 1 and 80
     or char_length(btrim(p_embedding_model)) not between 1 and 120
     or jsonb_typeof(p_classification) <> 'object'
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

  -- Cast validates the category against Bulletin's closed vocabulary.
  perform (p_classification->>'category')::public.news_category;

  update public.articles
  set embedding = p_embedding,
      embedding_provider = btrim(p_embedding_provider),
      embedding_model = btrim(p_embedding_model),
      embedding_dimensions = 768,
      classification = p_classification,
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

create or replace function public.find_article_cluster_candidates(
  p_article_id uuid,
  p_limit integer default 12,
  p_lookback_hours integer default 96
)
returns table (cluster_id uuid, cosine_distance double precision, cluster_snapshot jsonb)
language sql
stable
security invoker
set search_path = ''
as $$
  with subject as (
    select article.*,
      (article.classification->>'category')::public.news_category as classified_category
    from public.articles as article
    where article.id = p_article_id
      and article.processing_status = 'claimed'
      and article.embedding is not null
      and article.event_type is not null
  ), candidates as (
    select cluster.*,
      cluster.representative_embedding operator(extensions.<=>) subject.embedding as distance
    from subject
    join public.story_clusters as cluster on true
    where cluster.status in ('candidate', 'open', 'verified')
      and cluster.representative_embedding is not null
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
    order by distance, cluster.latest_event_at desc, cluster.id
    limit greatest(1, least(p_limit, 20))
  )
  select candidate.id,
         candidate.distance,
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
  order by candidate.distance, candidate.latest_event_at desc, candidate.id;
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
  if article_record.embedding is null
     or article_record.classification is null
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
        representative_embedding, latest_event_at, event_type, event_time,
        key_action, key_outcome, important_numbers, event_fingerprint,
        verification_version, evidence_result
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
        article_record.embedding,
        coalesce(article_record.event_time, article_record.published_at),
        article_record.event_type, article_record.event_time,
        article_record.key_action, article_record.key_outcome,
        article_record.important_numbers, article_record.event_fingerprint,
        p_verification_version,
        jsonb_build_object('policyVersion', 'phase-7-v1')
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
      'policyVersion', 'phase-7-v1',
      'semanticSimilarityOnlyProposedCandidate', p_preferred_cluster_id is not null
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
        'policyVersion', 'phase-7-v1',
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
      representative_embedding = case
        when accepted_before = 0 or p_is_meaningful_update then article_record.embedding
        else representative_embedding
      end,
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

create or replace function public.enqueue_cluster_localization(
  p_cluster_id uuid,
  p_cluster_version integer,
  p_language public.briefing_language,
  p_now timestamptz default statement_timestamp()
)
returns uuid
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  result_id uuid;
begin
  if p_language not in ('hi', 'ml') then
    raise exception using errcode = '22023', message = 'localization language must be Hindi or Malayalam';
  end if;
  perform 1
  from public.story_clusters as cluster
  join public.cluster_summaries as canonical
    on canonical.cluster_id = cluster.id
   and canonical.cluster_version = cluster.current_version
   and canonical.language = 'en'
   and canonical.status = 'verified'
  where cluster.id = p_cluster_id
    and cluster.status = 'verified'
    and cluster.current_version = p_cluster_version;
  if not found then
    raise exception using errcode = '55000', message = 'verified canonical summary required';
  end if;

  insert into public.cluster_summaries (
    cluster_id, cluster_version, language, status, next_attempt_at
  ) values (p_cluster_id, p_cluster_version, p_language, 'pending', p_now)
  on conflict (cluster_id, cluster_version, language)
  do update set cluster_id = excluded.cluster_id
  returning id into result_id;
  return result_id;
end;
$$;

create or replace function public.claim_cluster_summaries(
  p_worker_id uuid,
  p_batch_size integer default 5,
  p_lease_seconds integer default 300,
  p_now timestamptz default statement_timestamp()
)
returns table (summary_id uuid, cluster_id uuid, cluster_version integer, language public.briefing_language, lease_token uuid)
language sql
volatile
security invoker
set search_path = ''
as $$
  with candidates as (
    select summary.id
    from public.cluster_summaries as summary
    join public.story_clusters as cluster on cluster.id = summary.cluster_id
    where summary.status in ('pending', 'retry-wait', 'generating')
      and (
        (summary.status in ('pending', 'retry-wait') and summary.next_attempt_at <= p_now)
        or (summary.status = 'generating' and summary.lease_expires_at <= p_now)
      )
      and (summary.lease_expires_at is null or summary.lease_expires_at <= p_now)
      and summary.attempt_count < 5
      and cluster.status = 'verified'
      and cluster.current_version = summary.cluster_version
      and (
        summary.language = 'en'
        or exists (
          select 1 from public.cluster_summaries as canonical
          where canonical.cluster_id = summary.cluster_id
            and canonical.cluster_version = summary.cluster_version
            and canonical.language = 'en'
            and canonical.status = 'verified'
        )
      )
    order by case when summary.language = 'en' then 0 else 1 end,
             summary.next_attempt_at, summary.cluster_id, summary.language
    for update of summary skip locked
    limit greatest(1, least(p_batch_size, 10))
  ), claimed as (
    update public.cluster_summaries as summary
    set status = 'generating',
        attempt_count = attempt_count + 1,
        lease_token = gen_random_uuid(),
        lease_owner = p_worker_id,
        lease_expires_at = p_now + make_interval(secs => greatest(60, least(p_lease_seconds, 900)))
    from candidates
    where summary.id = candidates.id
    returning summary.id, summary.cluster_id, summary.cluster_version,
              summary.language, summary.lease_token
  )
  select id, cluster_id, cluster_version, language, claimed.lease_token from claimed;
$$;

create or replace function public.complete_cluster_summary_claim(
  p_summary_id uuid,
  p_lease_token uuid,
  p_status public.summary_status,
  p_headline text default null,
  p_summary text default null,
  p_why_it_matters text default null,
  p_attribution_markers jsonb default '[]'::jsonb,
  p_verification_result jsonb default null,
  p_prompt_version text default null,
  p_schema_version text default null,
  p_provider text default null,
  p_model text default null,
  p_model_metadata jsonb default null,
  p_source_article_ids uuid[] default null,
  p_verification_version text default null,
  p_repair_attempted boolean default false,
  p_retry_at timestamptz default null,
  p_error_code text default null,
  p_now timestamptz default statement_timestamp()
)
returns boolean
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  summary_record public.cluster_summaries%rowtype;
  valid_source_count integer;
begin
  if p_status not in (
    'verified', 'retry-wait', 'insufficient-evidence',
    'conflicting-evidence', 'invalid-input', 'failed'
  ) then
    raise exception using errcode = '22023', message = 'invalid summary completion status';
  end if;
  if p_status = 'retry-wait' and (p_retry_at is null or p_retry_at <= p_now) then
    raise exception using errcode = '22023', message = 'future summary retry time required';
  end if;

  select summary.* into summary_record
  from public.cluster_summaries as summary
  join public.story_clusters as cluster on cluster.id = summary.cluster_id
  where summary.id = p_summary_id
    and summary.lease_token = p_lease_token
    and summary.status = 'generating'
    and cluster.current_version = summary.cluster_version
    and (p_status <> 'verified' or cluster.status = 'verified')
  for update of summary, cluster;
  if not found then return false; end if;

  if p_status = 'verified' then
    if p_headline is null or btrim(p_headline) = ''
       or p_summary is null or btrim(p_summary) = ''
       or p_why_it_matters is null or btrim(p_why_it_matters) = ''
       or jsonb_typeof(p_attribution_markers) <> 'array'
       or p_verification_result is null
       or jsonb_typeof(p_verification_result) <> 'object'
       or p_verification_result->>'passed' <> 'true'
       or p_prompt_version is null or p_schema_version is null
       or p_provider is null or p_model is null
       or p_model_metadata is null
       or jsonb_typeof(p_model_metadata) <> 'object'
       or p_source_article_ids is null
       or p_verification_version is null
       or char_length(btrim(p_verification_version)) not between 1 and 80
       or cardinality(p_source_article_ids) = 0
       or cardinality(p_source_article_ids) <>
          (select count(distinct source_id) from unnest(p_source_article_ids) as item(source_id)) then
      raise exception using errcode = '22023', message = 'verified summary content and provenance are required';
    end if;

    select count(*)::integer into valid_source_count
    from unnest(p_source_article_ids) as requested(article_id)
    join public.story_cluster_articles as relation
      on relation.article_id = requested.article_id
     and relation.cluster_id = summary_record.cluster_id
     and relation.decision = 'accepted';
    if valid_source_count <> cardinality(p_source_article_ids) then
      raise exception using errcode = '22023', message = 'summary citation is not accepted cluster evidence';
    end if;

    update public.cluster_summaries
    set status = 'verified',
        headline = btrim(p_headline),
        summary = btrim(p_summary),
        why_it_matters = btrim(p_why_it_matters),
        attribution_markers = p_attribution_markers,
        verification_result = p_verification_result,
        prompt_version = btrim(p_prompt_version),
        schema_version = btrim(p_schema_version),
        provider = btrim(p_provider),
        model = btrim(p_model),
        model_metadata = p_model_metadata,
        source_references = (
          select jsonb_agg(
            jsonb_build_object(
              'articleId', requested.article_id,
              'publisherName', source.publisher_name,
              'canonicalUrl', article.canonical_url
            ) order by requested.ordinality
          )
          from unnest(p_source_article_ids) with ordinality as requested(article_id, ordinality)
          join public.articles as article on article.id = requested.article_id
          join public.sources as source on source.id = article.source_id
        ),
        content_hash = extensions.digest(
          btrim(p_headline) || E'\n' || btrim(p_summary) || E'\n' || btrim(p_why_it_matters),
          'sha256'
        ),
        verification_version = btrim(p_verification_version),
        repair_attempted = p_repair_attempted,
        verified_at = p_now,
        last_error_code = null,
        lease_token = null,
        lease_owner = null,
        lease_expires_at = null
    where id = p_summary_id;

    delete from public.cluster_summary_articles where summary_id = p_summary_id;
    insert into public.cluster_summary_articles (summary_id, article_id, citation_order)
    select p_summary_id, requested.article_id, requested.ordinality::smallint
    from unnest(p_source_article_ids) with ordinality as requested(article_id, ordinality);

    if summary_record.language = 'en' then
      update public.story_clusters set summary_due_at = null
      where id = summary_record.cluster_id and current_version = summary_record.cluster_version;
    end if;
  else
    update public.cluster_summaries
    set status = p_status,
        next_attempt_at = case when p_status = 'retry-wait' then p_retry_at else next_attempt_at end,
        last_error_code = nullif(btrim(p_error_code), ''),
        repair_attempted = p_repair_attempted,
        lease_token = null,
        lease_owner = null,
        lease_expires_at = null
    where id = p_summary_id;

    if summary_record.language = 'en' and p_status = 'insufficient-evidence' then
      update public.story_clusters
      set status = 'quarantined', evidence_strength = 'weak', summary_due_at = null
      where id = summary_record.cluster_id and current_version = summary_record.cluster_version;
    elsif summary_record.language = 'en' and p_status = 'conflicting-evidence' then
      update public.story_clusters
      set status = 'conflicted', evidence_strength = 'conflicted', summary_due_at = null
      where id = summary_record.cluster_id and current_version = summary_record.cluster_version;
    end if;
  end if;
  return true;
end;
$$;

revoke execute on function public.reserve_ai_provider_usage(
  text, text, text, integer, integer, integer, integer, integer, integer, integer, timestamptz
) from public, anon, authenticated;
revoke execute on function public.stage_article_intelligence(
  uuid, uuid, extensions.vector, text, text, jsonb, text, jsonb, text,
  timestamptz, text, text, jsonb, text[], smallint, bytea, jsonb
) from public, anon, authenticated;
revoke execute on function public.find_article_cluster_candidates(uuid, integer, integer)
  from public, anon, authenticated;
revoke execute on function public.commit_article_to_story_cluster(
  uuid, uuid, uuid, text, jsonb, boolean, boolean, jsonb, uuid, text, text, timestamptz
) from public, anon, authenticated;
revoke execute on function public.enqueue_cluster_localization(uuid, integer, public.briefing_language, timestamptz)
  from public, anon, authenticated;
revoke execute on function public.claim_cluster_summaries(uuid, integer, integer, timestamptz)
  from public, anon, authenticated;
revoke execute on function public.complete_cluster_summary_claim(
  uuid, uuid, public.summary_status, text, text, text, jsonb, jsonb, text,
  text, text, text, jsonb, uuid[], text, boolean, timestamptz, text, timestamptz
) from public, anon, authenticated;

grant execute on function public.reserve_ai_provider_usage(
  text, text, text, integer, integer, integer, integer, integer, integer, integer, timestamptz
) to service_role;
grant execute on function public.stage_article_intelligence(
  uuid, uuid, extensions.vector, text, text, jsonb, text, jsonb, text,
  timestamptz, text, text, jsonb, text[], smallint, bytea, jsonb
) to service_role;
grant execute on function public.find_article_cluster_candidates(uuid, integer, integer)
  to service_role;
grant execute on function public.commit_article_to_story_cluster(
  uuid, uuid, uuid, text, jsonb, boolean, boolean, jsonb, uuid, text, text, timestamptz
) to service_role;
grant execute on function public.enqueue_cluster_localization(uuid, integer, public.briefing_language, timestamptz)
  to service_role;
grant execute on function public.claim_cluster_summaries(uuid, integer, integer, timestamptz)
  to service_role;
grant execute on function public.complete_cluster_summary_claim(
  uuid, uuid, public.summary_status, text, text, text, jsonb, jsonb, text,
  text, text, text, jsonb, uuid[], text, boolean, timestamptz, text, timestamptz
) to service_role;

-- claim_articles was replaced above; permissions survive CREATE OR REPLACE,
-- but repeat the least-privilege grant explicitly for auditability.
revoke execute on function public.claim_articles(uuid, integer, integer, timestamptz)
  from public, anon, authenticated;
grant execute on function public.claim_articles(uuid, integer, integer, timestamptz)
  to service_role;

comment on function public.find_article_cluster_candidates is
  'Bounded semantic proposal only: at most 20 recent category/geography-plausible clusters. Event consistency must be validated before commit.';
comment on function public.commit_article_to_story_cluster is
  'Lease-bound article completion, deterministic event identity, publisher-family/syndication-aware evidence, cluster versioning, and canonical English summary enqueue in one transaction.';
comment on function public.enqueue_cluster_localization is
  'Queues one shared Hindi or Malayalam version only after a verified English canonical summary exists; accepts no subscriber data.';
