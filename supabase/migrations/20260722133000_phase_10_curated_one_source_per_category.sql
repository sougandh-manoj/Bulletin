-- Bulletin Phase 10: reduce active ingestion to a small category-balanced set.
--
-- The full reviewed catalogue remains in place for attribution history and
-- future expansion, but only a deliberately small set is scheduled. This keeps
-- ingestion and Groq summarization predictable while the fresh pipeline soaks.

begin;

with selected_sources(catalogue_key) as (
  values
    ('ndtv-english-india'),              -- India
    ('bbc-world'),                       -- World
    ('onmanorama-kerala'),               -- Regional & Local
    ('india-today-nation'),              -- Politics
    ('bbc-business'),                    -- Business & Economy
    ('rbi-press-releases'),              -- Markets & Personal Finance
    ('gadgets-360-latest'),              -- Technology & AI
    ('phys-org-science-technology'),     -- Science
    ('medical-xpress-health'),           -- Health
    ('pib-hindi'),                       -- Government Schemes
    ('india-today-sports'),              -- Sports
    ('ndtv-english-latest'),             -- Entertainment, from a broad approved feed
    ('mongabay-india-climate')           -- Climate
),
source_positions as (
  select source.id,
         row_number() over (order by source.catalogue_key) - 1 as position
  from public.sources as source
  join selected_sources using (catalogue_key)
),
source_activation as (
  select source.id,
         source_positions.position,
         source_positions.id is not null as should_be_active
  from public.sources as source
  left join source_positions on source_positions.id = source.id
)
update public.sources as source
set is_active = source_activation.should_be_active,
    health = case
      when source_activation.should_be_active then 'unknown'::public.source_health
      else 'disabled'::public.source_health
    end,
    next_fetch_at = case
      when source_activation.should_be_active
        then statement_timestamp() + make_interval(mins => ((source_activation.position / 4)::integer * 5))
      else null
    end,
    lease_token = null,
    lease_owner = null,
    lease_expires_at = null,
    updated_at = statement_timestamp()
from source_activation
where source.id = source_activation.id;

commit;
