# Phase 10 Worker and Scheduler Runbook

Production workers are stateless Vercel functions invoked by Supabase Cron through authenticated HTTPS POST requests. Persistent state, leases, retries, unique delivery slots, quota accounting, and kill switches remain in Supabase. No in-memory singleton or always-on process is required.

| Job | Schedule | Route |
|---|---:|---|
| Ingestion | every 5 minutes | `/api/internal/ingestion` |
| Intelligence | every minute | `/api/internal/intelligence` |
| Shared summaries | every minute | `/api/internal/shared-summaries` |
| Personalization/scheduler | every minute | `/api/internal/personalization` |
| Delivery | every minute | `/api/internal/delivery` |

The five asynchronous HTTP jobs may overlap. This is expected: database leases, `SKIP LOCKED`, attempt limits, and unique subscriber/schedule slots provide correctness. Work produced by one stage becomes eligible for a later invocation; a single minute is not treated as one atomic pipeline.

The schedule is installed only by `supabase/production/phase10_install_vercel_cron.sql` after the HTTPS origin and shared secret exist in Vault. Schema migrations never begin external scheduling automatically. The script queues about 181,440 invocations in a 30-day month, below Vercel Hobby's published one-million included function invocations before ordinary traffic.

## Source timing

- Active feeds retain their fixed 30-minute `next_fetch_at` interval.
- New production feeds are staggered across the first 30 minutes.
- Undated, invalid, future, or older-than-48-hour entries are rejected.
- Unfinished work that ages past 48 hours is quarantined.

## Enablement and stop order

Enable: ingestion → intelligence/summaries → personalization → delivery worker → global email. Stop in reverse, with global email first. To stop all HTTP wakes, run `supabase/production/phase10_remove_vercel_cron.sql`; it removes only the five Bulletin jobs and does not delete data or Vault secrets.

## Health

- `/api/health/live`: Vercel function liveness.
- `/api/health/ready`: production environment and database readiness, with generic output.
- Supabase: `cron.job` and `cron.job_run_details` show schedule execution.
- Bulletin dashboard: heartbeats, leases, backlog, quota, source, delivery, and alerts.

Repeated 503s, missing Cron runs, stale heartbeats, quota circuits, or ambiguous sends keep rollout closed. The local sequential process runner and Docker image are test/self-hosted fallbacks only.
