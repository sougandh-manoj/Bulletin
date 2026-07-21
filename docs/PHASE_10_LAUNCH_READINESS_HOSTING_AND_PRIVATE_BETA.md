# Bulletin Phase 10 — Launch Readiness, Hosting, and Private Beta

> **Status:** In progress from 19 July 2026. Local readiness milestone complete; production provisioning, legal publication, production browser/email proof, scheduled owner delivery, and the 7–14 day soak remain open.  
> **External mutations:** None. No production account, deployment, database, Gmail, DNS, user, or invitation was created or changed.

## Outcome so far

Phase 10 now has protected stateless worker routes, a fail-closed Supabase Cron-to-Vercel installer, Vercel deployment metadata, a local/self-hosted fallback runner, security headers, strict 48-hour initialization, no-backlog database controls, isolated migration replay, load tests, owner-approved legal drafts, and operating notes.

The phase is not complete. The private beta remains closed.

## Audited starting state

- Phases 1–9 were present and ordinary lint, TypeScript, and 209 tests passed before Phase 10 changes.
- The workspace has no Git repository or Git status/history. A private remote repository is optional for this personal beta; Vercel deployment revisions provide application rollback after provisioning.
- Local Supabase remained running and was not reset, deleted, or replaced.
- The first baseline build passed outside the sandbox; the sandbox-only attempt failed because Turbopack was forbidden from opening its local compiler port.
- Current runtime on the Mac is Node 20.16 and emits Supabase’s deprecation warning. Production is pinned to Node 22.

## Chosen production architecture

```text
Vercel Hobby HTTPS origin ($0)
  └─ Next.js 16 web + protected stateless worker functions
        ↑ authenticated HTTPS POST
Supabase Free Cron + Vault ($0)
        │
        ├─ Supabase PostgreSQL (clean migrations; service-role server only)
        ├─ Groq shared public-news summaries only
        └─ Gmail SMTP delivery

```

Why: Vercel Hobby's own Cron is not used. Supabase Cron supports minute schedules and asynchronous HTTP requests, so it can wake the protected Vercel functions without an always-on process. Five bounded jobs produce about 181,440 scheduled invocations in a 30-day month, below Vercel Hobby's published one-million included function invocations before normal site traffic. If the free architecture fails the launch gate, rollout stops; paid hosting is not silently substituted.

## Implemented milestones

1. `apps/web/vercel.json` declares the Next.js project; the Docker image/process supervisor remain optional self-hosted fallbacks and the paid Render blueprint was removed.
2. Readiness validates HTTPS origin, SMTP, owner, Groq, database, independent web secrets, and absence of sensitive `NEXT_PUBLIC_*` names. Backup credentials are excluded from Vercel.
3. A production-only SQL installer reads the HTTPS origin and bearer secret from Supabase Vault, rejects unsafe/missing configuration, and installs five bounded jobs without embedding credentials.
4. Scheduled offsite backup is intentionally deferred by owner decision for this small personal beta. The existing optional implementation remains dormant and is not a launch gate.
5. Forward migrations make every production worker and email fail closed, stagger first feed fetches, quarantine uncompleted articles older than 48 hours, and recover only fresh expired leases.
6. Privacy Policy and Terms exist locally at `/privacy` and `/terms`, are owner-approved for the private beta, remain no-index, and are not yet externally published.
7. Load tests prove 100 simultaneous due schedules create 100 unique delivery slots and 2,000 atomic preference updates preserve exact versions/history.
8. A disposable isolated database replay applies all migrations and seed, runs Phase 10 bootstrap assertions, then the complete prior pgTAP suite without resetting the protected local database.

## Current provider and legal findings

- Groq `openai/gpt-oss-20b` is a current production model. Published free limits are 30 requests/minute, 1,000/day, 8,000 tokens/minute, and 200,000/day; configured limits remain lower at 25, 900, 5,500, and 160,000.
- Groq lists the model at US$0.075/million input and US$0.30/million output tokens on paid developer usage. Ordinary inference is not retained by default; reliability/abuse logging may last up to 30 days, and Zero Data Retention is available.
- Gmail personal accounts publish a limit of 500 messages/day. The intended 50–100-person beta remains below that ceiling, but warm-up, sender authentication, consent, and bounce handling still require production evidence.
- Supabase Free includes 500 MB database space and may pause after inactivity. For the personal beta the owner accepts possible data loss and would ask participants to register again if recovery is impossible; independent backup can be revisited if the project grows.
- India’s 13 November 2025 commencement notification brought only specified DPDP provisions into force immediately. Most notice, consent, fiduciary-duty, rights, and child-data provisions are scheduled 18 months later, on 13 May 2027. Bulletin’s drafts prepare for them without claiming they are all currently commenced.
- NDTV’s RSS-specific terms permit personal, non-commercial headline-feed use with attribution, while its general service terms separately restrict automated access. On 19 July 2026 the owner approved the official feeds for the bounded personal, non-commercial private beta. Bulletin renders `NDTV.com` with each direct original-article link in HTML and plain text. The ambiguity remains recorded and requires re-review or permission before public or commercial use.

## Validation evidence

- Baseline: lint passed; TypeScript passed; 209 tests passed; build passed.
- After implementation: TypeScript and lint passed; 211 ordinary tests passed with opt-in suites skipped as designed.
- Phase 10 load: passed in 32.18 seconds with 100 due subscribers and 2,000 preference saves.
- Isolated database: 26 migrations applied cleanly; 8 Phase 10 bootstrap assertions passed; all Phase 2, 4, 6, 7, 8, and 9 database assertions passed.
- Strict database lint: zero findings.
- npm audit: zero high/critical findings; two moderate findings remain in Next.js’s bundled PostCSS path. npm’s offered force fix is an invalid breaking downgrade, so it was not applied.
- Final build, client secret scan, browser/email-client matrix, live production smoke, timing evidence, and soak are recorded separately and remain launch gates where not yet completed.

## External authorization checkpoint

Before the next milestone the owner must approve creating/configuring the Vercel Hobby project, Supabase Free project, and provider credentials. No chargeable hosting, backup service, invitation, or subscriber migration is included. Production begins with the owner account only and all worker/email controls paused.

## Completion rule

Phase 10 and the Bulletin roadmap must remain **in progress** until the approved legal pages are published, production HTTPS/access and email clients pass, a real scheduled owner briefing arrives, every alert/worker gate passes, remaining publisher terms are resolved, and a 7–14 day soak completes successfully.
