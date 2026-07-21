-- Bulletin Phase 6: lease-bound source completion and idempotent article writes.

create or replace function public.complete_source_ingestion(
  p_source_id uuid,
  p_lease_token uuid,
  p_outcome text,
  p_next_fetch_at timestamptz,
  p_http_status integer default null,
  p_etag text default null,
  p_last_modified text default null,
  p_response_bytes integer default null,
  p_effective_url text default null,
  p_article_count integer default 0,
  p_duplicate_count integer default 0,
  p_error_code text default null,
  p_retry_after_at timestamptz default null,
  p_parser_version text default null,
  p_now timestamptz default statement_timestamp()
)
returns boolean
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  succeeded boolean;
begin
  if p_outcome not in ('success', 'not-modified', 'failure') then
    raise exception using errcode = '22023', message = 'unknown source ingestion outcome';
  end if;
  if p_next_fetch_at is null or p_next_fetch_at <= p_now then
    raise exception using errcode = '22023', message = 'next fetch must be in the future';
  end if;
  if p_http_status is not null and p_http_status not between 100 and 599 then
    raise exception using errcode = '22023', message = 'invalid HTTP status';
  end if;
  if p_response_bytes is not null and p_response_bytes < 0 then
    raise exception using errcode = '22023', message = 'invalid response size';
  end if;
  if p_article_count < 0 or p_duplicate_count < 0 then
    raise exception using errcode = '22023', message = 'invalid ingestion counts';
  end if;
  if p_error_code is not null and char_length(p_error_code) > 100 then
    raise exception using errcode = '22023', message = 'error code is too long';
  end if;

  succeeded := p_outcome in ('success', 'not-modified');

  update public.sources
  set last_fetch_at = p_now,
      next_fetch_at = p_next_fetch_at,
      last_successful_fetch_at = case when succeeded then p_now else last_successful_fetch_at end,
      consecutive_failures = case when succeeded then 0 else consecutive_failures + 1 end,
      health = case
        when succeeded then 'healthy'::public.source_health
        when consecutive_failures + 1 >= 3 then 'failing'::public.source_health
        else 'degraded'::public.source_health
      end,
      etag = case
        when succeeded and p_etag is not null then nullif(btrim(p_etag), '')
        else etag
      end,
      last_modified = case
        when succeeded and p_last_modified is not null then nullif(btrim(p_last_modified), '')
        else last_modified
      end,
      last_http_status = p_http_status,
      last_response_bytes = p_response_bytes,
      last_effective_url = p_effective_url,
      last_error_code = case when succeeded then null else coalesce(p_error_code, 'fetch-failed') end,
      last_error_at = case when succeeded then null else p_now end,
      retry_after_at = case when succeeded then null else p_retry_after_at end,
      parser_version = case
        when p_outcome = 'success' then coalesce(p_parser_version, parser_version)
        else parser_version
      end,
      last_article_count = case when p_outcome = 'success' then p_article_count else last_article_count end,
      last_duplicate_count = case when p_outcome = 'success' then p_duplicate_count else last_duplicate_count end,
      lease_token = null,
      lease_owner = null,
      lease_expires_at = null
  where id = p_source_id
    and lease_token = p_lease_token;

  return found;
end;
$$;

create or replace function public.insert_ingested_article(
  p_source_id uuid,
  p_source_lease_token uuid,
  p_original_title text,
  p_normalized_title text,
  p_original_url text,
  p_canonical_url text,
  p_canonical_url_hash bytea,
  p_normalized_title_hash bytea,
  p_description text,
  p_author text,
  p_published_at timestamptz,
  p_declared_language public.briefing_language,
  p_country_code text,
  p_state_region text,
  p_city text,
  p_feed_categories text[],
  p_raw_metadata jsonb,
  p_feed_entry_id text default null,
  p_feed_updated_at timestamptz default null,
  p_timestamp_source text default null,
  p_language_source text default null,
  p_geography_source text default null,
  p_duplicate_of_article_id uuid default null,
  p_duplicate_kind text default null,
  p_normalization_version text default 'phase-6-v1',
  p_now timestamptz default statement_timestamp()
)
returns table (article_id uuid, outcome text)
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  inserted_id uuid;
  duplicate_record public.articles%rowtype;
begin
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

  if p_duplicate_of_article_id is not null then
    select * into duplicate_record
    from public.articles
    where id = p_duplicate_of_article_id;

    if not found or duplicate_record.source_id <> p_source_id then
      raise exception using errcode = '22023', message = 'duplicate target must use the same source';
    end if;
    if p_duplicate_kind = 'same-source-title'
       and abs(extract(epoch from (p_published_at - duplicate_record.published_at))) > 259200 then
      raise exception using errcode = '22023', message = 'title duplicate is outside the 72-hour bound';
    elsif p_duplicate_kind = 'same-source-near-title'
       and abs(extract(epoch from (p_published_at - duplicate_record.published_at))) > 21600 then
      raise exception using errcode = '22023', message = 'near duplicate is outside the 6-hour bound';
    elsif p_duplicate_kind not in ('same-source-title', 'same-source-near-title') then
      raise exception using errcode = '22023', message = 'invalid duplicate kind';
    end if;
  elsif p_duplicate_kind is not null then
    raise exception using errcode = '22023', message = 'duplicate kind requires a target';
  end if;

  insert into public.articles (
    source_id, original_title, normalized_title, original_url, canonical_url,
    canonical_url_hash, normalized_title_hash, description, author, published_at,
    declared_language, country_code, state_region, city, feed_categories,
    raw_metadata, feed_entry_id, feed_updated_at, timestamp_source,
    language_source, geography_source, duplicate_of_article_id, duplicate_kind,
    normalization_version, processing_status, next_processing_at
  ) values (
    p_source_id, p_original_title, p_normalized_title, p_original_url, p_canonical_url,
    p_canonical_url_hash, p_normalized_title_hash, p_description, p_author, p_published_at,
    p_declared_language, p_country_code, p_state_region, p_city,
    coalesce(p_feed_categories, '{}'), p_raw_metadata, p_feed_entry_id,
    p_feed_updated_at, p_timestamp_source, p_language_source, p_geography_source,
    p_duplicate_of_article_id, p_duplicate_kind, p_normalization_version,
    case
      when p_duplicate_of_article_id is null then 'pending'::public.article_processing_status
      else 'quarantined'::public.article_processing_status
    end,
    p_now
  )
  on conflict (canonical_url_hash) do nothing
  returning id into inserted_id;

  if inserted_id is null then
    return query select null::uuid, 'exact-duplicate'::text;
  elsif p_duplicate_of_article_id is not null then
    return query select inserted_id, 'near-duplicate'::text;
  else
    return query select inserted_id, 'inserted'::text;
  end if;
end;
$$;

revoke execute on function public.complete_source_ingestion(
  uuid, uuid, text, timestamptz, integer, text, text, integer, text,
  integer, integer, text, timestamptz, text, timestamptz
) from public, anon, authenticated;
revoke execute on function public.insert_ingested_article(
  uuid, uuid, text, text, text, text, bytea, bytea, text, text,
  timestamptz, public.briefing_language, text, text, text, text[], jsonb,
  text, timestamptz, text, text, text, uuid, text, text, timestamptz
) from public, anon, authenticated;

grant execute on function public.complete_source_ingestion(
  uuid, uuid, text, timestamptz, integer, text, text, integer, text,
  integer, integer, text, timestamptz, text, timestamptz
) to service_role;
grant execute on function public.insert_ingested_article(
  uuid, uuid, text, text, text, text, bytea, bytea, text, text,
  timestamptz, public.briefing_language, text, text, text, text[], jsonb,
  text, timestamptz, text, text, text, uuid, text, text, timestamptz
) to service_role;

comment on function public.complete_source_ingestion is
  'Lease-bound source completion with conditional-request state, health recovery, and bounded failure metadata.';
comment on function public.insert_ingested_article is
  'Lease-bound article insert. Exact canonical URL duplicates are rejected; bounded same-source near duplicates are quarantined.';
