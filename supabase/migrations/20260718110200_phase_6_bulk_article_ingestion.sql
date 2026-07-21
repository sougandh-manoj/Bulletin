-- Bulletin Phase 6: one lease-bound RPC per parsed feed. This avoids one
-- database round-trip per item while preserving exact URL idempotency and the
-- same-source near-duplicate constraints established in the prior migration.

create or replace function public.insert_ingested_articles(
  p_source_id uuid,
  p_source_lease_token uuid,
  p_articles jsonb,
  p_now timestamptz default statement_timestamp()
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  item jsonb;
  inserted_id uuid;
  duplicate_record public.articles%rowtype;
  duplicate_id uuid;
  duplicate_kind text;
  published_at timestamptz;
  inserted_count integer := 0;
  exact_duplicate_count integer := 0;
  near_duplicate_count integer := 0;
begin
  if jsonb_typeof(p_articles) <> 'array' then
    raise exception using errcode = '22023', message = 'articles must be a JSON array';
  end if;

  perform 1
  from public.sources
  where id = p_source_id
    and lease_token = p_source_lease_token
    and is_active
    and terms_status = 'approved'
    and technical_status = 'verified';
  if not found then
    raise exception using errcode = '55000', message = 'active source lease required';
  end if;

  for item in select value from jsonb_array_elements(p_articles)
  loop
    duplicate_id := nullif(item->>'duplicateOfArticleId', '')::uuid;
    duplicate_kind := nullif(item->>'duplicateKind', '');
    published_at := (item->>'publishedAt')::timestamptz;

    if duplicate_id is not null then
      select * into duplicate_record
      from public.articles
      where id = duplicate_id;

      if not found or duplicate_record.source_id <> p_source_id then
        raise exception using errcode = '22023', message = 'duplicate target must use the same source';
      end if;
      if duplicate_kind = 'same-source-title'
         and abs(extract(epoch from (published_at - duplicate_record.published_at))) > 259200 then
        raise exception using errcode = '22023', message = 'title duplicate is outside the 72-hour bound';
      elsif duplicate_kind = 'same-source-near-title'
         and abs(extract(epoch from (published_at - duplicate_record.published_at))) > 21600 then
        raise exception using errcode = '22023', message = 'near duplicate is outside the 6-hour bound';
      elsif duplicate_kind not in ('same-source-title', 'same-source-near-title') then
        raise exception using errcode = '22023', message = 'invalid duplicate kind';
      end if;
    elsif duplicate_kind is not null then
      raise exception using errcode = '22023', message = 'duplicate kind requires a target';
    end if;

    inserted_id := null;
    insert into public.articles (
      id, source_id, original_title, normalized_title, original_url, canonical_url,
      canonical_url_hash, normalized_title_hash, description, author, published_at,
      declared_language, country_code, state_region, city, feed_categories,
      raw_metadata, feed_entry_id, feed_updated_at, timestamp_source,
      language_source, geography_source, duplicate_of_article_id, duplicate_kind,
      normalization_version, processing_status, next_processing_at
    ) values (
      (item->>'id')::uuid,
      p_source_id,
      item->>'originalTitle',
      item->>'normalizedTitle',
      item->>'originalUrl',
      item->>'canonicalUrl',
      decode(item->>'canonicalUrlHash', 'hex'),
      decode(item->>'normalizedTitleHash', 'hex'),
      nullif(item->>'description', ''),
      nullif(item->>'author', ''),
      published_at,
      nullif(item->>'declaredLanguage', '')::public.briefing_language,
      nullif(item->>'countryCode', ''),
      nullif(item->>'stateRegion', ''),
      nullif(item->>'city', ''),
      coalesce(
        array(select jsonb_array_elements_text(coalesce(item->'feedCategories', '[]'::jsonb))),
        '{}'
      ),
      item->'rawMetadata',
      nullif(item->>'feedEntryId', ''),
      nullif(item->>'feedUpdatedAt', '')::timestamptz,
      nullif(item->>'timestampSource', ''),
      nullif(item->>'languageSource', ''),
      nullif(item->>'geographySource', ''),
      duplicate_id,
      duplicate_kind,
      coalesce(nullif(item->>'normalizationVersion', ''), 'phase-6-v1'),
      case
        when duplicate_id is null then 'pending'::public.article_processing_status
        else 'quarantined'::public.article_processing_status
      end,
      p_now
    )
    on conflict (canonical_url_hash) do nothing
    returning id into inserted_id;

    if inserted_id is null then
      exact_duplicate_count := exact_duplicate_count + 1;
    elsif duplicate_id is not null then
      near_duplicate_count := near_duplicate_count + 1;
    else
      inserted_count := inserted_count + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'inserted', inserted_count,
    'exactDuplicates', exact_duplicate_count,
    'nearDuplicates', near_duplicate_count
  );
end;
$$;

revoke execute on function public.insert_ingested_articles(uuid, uuid, jsonb, timestamptz)
  from public, anon, authenticated;
grant execute on function public.insert_ingested_articles(uuid, uuid, jsonb, timestamptz)
  to service_role;

comment on function public.insert_ingested_articles is
  'Bulk lease-bound Phase 6 article ingestion. Body size bounds cap input; no arbitrary item-count truncation is applied.';
