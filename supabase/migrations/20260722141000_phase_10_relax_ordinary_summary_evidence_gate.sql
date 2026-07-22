-- Bulletin Phase 10: allow ordinary title-only stories to be summarized.
--
-- Sensitive or conflicted clusters still require stricter evidence. Ordinary
-- single-source reporting can proceed to Groq as long as accepted evidence
-- exists, matching the title-only deduplication pipeline.

begin;

update public.cluster_summaries as summary
set status = 'pending',
    next_attempt_at = statement_timestamp(),
    last_error_code = null,
    lease_token = null,
    lease_owner = null,
    lease_expires_at = null,
    updated_at = statement_timestamp()
from public.story_clusters as cluster
where cluster.id = summary.cluster_id
  and summary.status = 'insufficient-evidence'
  and summary.last_error_code = 'cluster-insufficient-evidence'
  and not cluster.is_sensitive
  and coalesce(jsonb_array_length(cluster.conflict_details), 0) = 0
  and exists (
    select 1
    from public.story_cluster_articles as relation
    where relation.cluster_id = cluster.id
      and relation.decision = 'accepted'
  );

update public.story_clusters as cluster
set status = 'verified',
    evidence_strength = 'weak',
    summary_due_at = statement_timestamp(),
    updated_at = statement_timestamp()
where cluster.status = 'quarantined'
  and not cluster.is_sensitive
  and coalesce(jsonb_array_length(cluster.conflict_details), 0) = 0
  and exists (
    select 1
    from public.cluster_summaries as summary
    where summary.cluster_id = cluster.id
      and summary.status = 'pending'
  );

commit;
