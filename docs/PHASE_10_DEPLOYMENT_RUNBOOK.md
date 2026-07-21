# Phase 10 Deployment Runbook

## Approval boundary

Do not execute external steps until the owner approves each target. The approved cost shape is Vercel Hobby (`$0`) for Next.js and stateless worker routes plus Supabase Free (`$0`) for PostgreSQL and Cron. Groq and Gmail must remain within their free allowances. The owner may separately buy a low-cost domain; no domain or DNS change is implicit.

## Before provisioning

1. A private remote source repository is optional for this personal beta. If one is later used, confirm no `.env*`, dump, token-bearing screenshot, or secret is tracked.
2. Generate independent production secrets listed in `PHASE_10_PRODUCTION_SECRET_INVENTORY.md`.
3. Re-check the approved Privacy Policy, Terms, publisher decisions, and current provider limits.
4. Keep all production worker controls paused and global email disabled.

## Supabase Free

1. Create a clean production project; never copy the local database or subscribers.
2. Apply migrations and `supabase/seed.sql` in order.
3. Verify 95 reviewed catalogue rows, the owner-approved active subset, RLS, grants, functions, indexes, and fail-closed `system_controls`.
4. Enable the hosted Cron and `pg_net` modules, but do not install Bulletin jobs yet.
5. Store exactly two scheduler values in Supabase Vault: `bulletin_app_base_url` and `bulletin_cron_shared_secret`. The latter must match Vercel's `CRON_SHARED_SECRET`. Never place values in SQL files.

## Vercel Hobby

1. Import the private repository as one Next.js project only after approval.
2. Set Root Directory to `apps/web`, leave the framework output at `.next`, and keep workspace files outside the root available to the build.
3. Add server-only variables in Vercel's encrypted environment settings. Never use `NEXT_PUBLIC_` for secrets.
4. Deploy first to the assigned `*.vercel.app` HTTPS origin. `/api/health/ready` must return 200 before scheduling anything.
5. Confirm Node 22, function bundles, private route 401 behavior, and production client-secret scan.
6. Do not configure Vercel Cron. Supabase Cron is the minute scheduler.

## Install the worker schedule

1. Keep worker controls paused and email disabled.
2. Run `supabase/production/phase10_install_vercel_cron.sql` in the hosted SQL editor.
3. Installation must abort if Vault is missing, duplicated, non-HTTPS, or uses a short shared secret.
4. Confirm exactly five jobs: ingestion every five minutes; intelligence, shared summaries, personalization, and delivery every minute.
5. Verify the initial authenticated probe and several Cron/HTTP results before enabling a worker.

## Controlled enablement

1. Verify owner access and every kill switch.
2. Enable ingestion only; observe staggering and the 48-hour acceptance window.
3. Enable intelligence and summaries with conservative Groq ceilings.
4. Enable personalization and then delivery while global email remains disabled.
5. Enable real email only for the owner smoke account.
6. Do not schedule `/api/internal/backup` or configure Drive backup credentials. The owner accepted possible beta data loss and deferred offsite backup unless the project grows.

## Rollout

Owner only → successful 7–14 day soak → five trusted adults → twenty → 50–100. Every transition requires evidence and explicit owner approval. Never import local subscribers by default.
