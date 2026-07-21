-- Bulletin Phase 7: resumable shared-summary work needs a non-terminal retry
-- state. Keep this enum change in its own committed migration before indexes
-- and functions refer to the new value.

alter type public.summary_status add value if not exists 'retry-wait' after 'generating';

