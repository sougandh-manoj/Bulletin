# Phase 10 Rollback and Incident Response

## Immediate stop

1. Disable global email and pause every worker through owner controls.
2. If wakes must stop, run `supabase/production/phase10_remove_vercel_cron.sql`. It removes only Bulletin's five Cron jobs.
3. Preserve safe logs, job/run identifiers, alert records, checksums, and deployment IDs. Never copy secrets or subscriber addresses into notes.

## Release rollback

- Promote the last known-good Vercel deployment; never reverse an applied migration.
- If old code cannot operate with the current schema, deploy a forward compatibility migration first.
- Reinstall Cron only after `/api/health/ready`, private-route authentication, and the owner controls pass.

## Database incident

1. Stop scheduling, writes, and email.
2. Check whether Supabase provides any project-level recovery option for the incident.
3. If recovery is unavailable, create a clean project, reapply migrations and seed, and ask personal-beta participants to register again. The owner explicitly accepts this risk for the current beta.
4. Resume stages one at a time; never invent or reconstruct sent states without evidence.

## Email, provider, or source incident

- Disable email immediately on unexpected volume, wrong-recipient risk, authentication failure, or uncertain SMTP acceptance.
- Never retry `sent` or ambiguous `sending` work.
- Pause intelligence on quota, authentication, model, or schema anomalies.
- Disable/defer a source on material terms changes, unsafe redirects, malformed output, or attribution failure.

The owner dashboard is primary. Record start/end, safe impact counts, decision, recovery proof, and follow-up without PII.
