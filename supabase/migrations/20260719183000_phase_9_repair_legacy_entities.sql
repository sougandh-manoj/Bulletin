-- Repair legacy local-preview clusters that predate the canonical entity shape.
-- Their empty objects were harmless in storage but could interrupt candidate
-- evaluation after the live worker began processing a larger batch.
update public.story_clusters
set entities = jsonb_build_object(
  'people', case when jsonb_typeof(entities->'people') = 'array' then entities->'people' else '[]'::jsonb end,
  'organizations', case when jsonb_typeof(entities->'organizations') = 'array' then entities->'organizations' else '[]'::jsonb end,
  'locations', case when jsonb_typeof(entities->'locations') = 'array' then entities->'locations' else '[]'::jsonb end
)
where jsonb_typeof(entities->'people') is distinct from 'array'
   or jsonb_typeof(entities->'organizations') is distinct from 'array'
   or jsonb_typeof(entities->'locations') is distinct from 'array';

-- These articles failed before a database commit solely because candidate
-- evaluation encountered the legacy shape. Return them to the normal queue.
update public.articles
set processing_status = 'retry-wait',
    next_processing_at = statement_timestamp(),
    last_error_code = null,
    lease_token = null,
    lease_owner = null,
    lease_expires_at = null
where processing_status = 'failed'
  and last_error_code = 'unexpected-intelligence-error'
  and processing_attempts < 5;
