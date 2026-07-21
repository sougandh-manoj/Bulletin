# Bulletin Phase 2 — Database

Status: complete on 12 July 2026; vector foundations removed by the approved
Phase 7 simplification on 19 July 2026.

This document records the database design frozen before the Phase 2 migrations were created. The SQL migrations are the executable source of truth. This document explains the boundaries and the reasons behind them without exposing private ranking, clustering, or security-secret values.

## Scope and phase boundary

Phase 2 provides the database, constraints, transaction functions, worker leases, RLS, retention foundations, and database tests required by later phases. It does not add onboarding pages, verification routes, management links, source records, workers, ranking behavior, email rendering, or admin UI.

The implementation follows the master context's shared-public-news/per-subscriber-delivery split. Subscriber PII is never placed in public-news tables.

## Official guidance used

The implementation was checked against current official guidance on 12 July 2026:

- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase database functions and function privileges](https://supabase.com/docs/guides/database/functions)
- [Supabase local migrations](https://supabase.com/docs/guides/local-development/overview)
- [Supabase database testing](https://supabase.com/docs/guides/local-development/testing/overview)
- [PostgreSQL row locking and `SKIP LOCKED`](https://www.postgresql.org/docs/current/sql-select.html)
- [PostgreSQL row security](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
- [PostgreSQL constraints and foreign keys](https://www.postgresql.org/docs/current/ddl-constraints.html)

Functions default to `SECURITY INVOKER`; every function fixes an empty
`search_path`, every relation is schema-qualified, and execution is revoked
from browser roles.

## Extensions and schemas

- `extensions.pgcrypto` supplies UUID/hash primitives used by local tests and database-generated claim tokens.
- `public` contains Data API-visible tables and reviewed RPC functions.
- `bulletin_private` is not exposed through the Data API and contains trigger/validation helpers only.

The original Phase 2 schema reserved vector columns for a possible semantic
clustering implementation. Phase 7 ultimately chose simpler deterministic
clustering; forward migration `20260719010000_phase_7_rule_based_clustering.sql`
removes those columns, indexes, and the unused vector extension.

## Closed vocabularies

PostgreSQL enums structurally restrict stable product and state-machine values:

| Enum | Values |
|---|---|
| `subscriber_status` | `pending`, `active`, `paused` |
| `briefing_language` | `en`, `hi`, `ml` |
| `briefing_theme` | `light-editorial`, `dark-intelligence` (stable internal value displayed as Signal Brief), `midnight-brief`, `amber-brief` |
| `delivery_frequency` | `daily`, `weekdays`, `weekends`, `weekly` |
| `weekday` | Monday through Sunday, lowercase |
| `news_category` | The 15 Phase 1 category slugs |
| `preference_change_reason` | `onboarding-initial`, `save-changes`, `theme-change`, `recovery` |
| `token_status` | `active`, `consumed`, `invalidated` |
| `rate_limit_scope` | Email check, verification/management requests, token validation, admin access |
| Source enums | Reliability tier, primary/supplementary role, health, and terms-review status |
| `article_processing_status` | Pending/claimed/processed/retry/failure/quarantine states |
| Cluster enums | Candidate/open/verified/conflicted/quarantined, evidence strength, and join decision |
| `summary_status` | Strict shared-AI outcomes plus pending/generating |
| `delivery_status` | Pending through guarded claim/render/send, retry, sent, failed, or cancelled |
| Operations enums | Audit outcome and alert severity/status |

Enum values match Phase 1 TypeScript slugs where the product already froze those values.

## Tables and exact ownership

Exact column types, defaults, checks, and comments are in `20260712190000_phase_2_core_schema.sql`.

### Subscriber-owned personal data

| Table | Purpose and principal columns |
|---|---|
| `subscribers` | UUID PK, separate public UUID reference, normalized unique email, name, account status, verification timestamp/generation, management token version, consent timestamp/version, seven-day pending expiry, timestamps |
| `subscriber_preferences` | One-to-one subscriber PK/FK; country, state/region, city, language, category array, positive/excluded topics, story count, theme, optimistic version, timestamps |
| `subscriber_schedules` | One-to-one subscriber PK/FK; frequency, optional weekly day, exact local `time(0)`, IANA timezone, next/last UTC slots, timestamps |
| `preference_versions` | Identity PK, subscriber FK, unique subscriber/version, reason, validated previous JSON snapshot, 30-day expiry |
| `email_verification_tokens` | UUID PK, subscriber FK, unique 32-byte token hash, subscriber generation, one-time state, 24-hour expiry, lifecycle timestamps |
| `subscriber_sessions` | UUID PK, subscriber FK, unique 32-byte cookie-token hash, CSRF hash, subscriber token version, short expiry/use/revocation timestamps |
| `deliveries` | UUID PK, subscriber FK, immutable UTC schedule slot, preference/language/theme snapshot, explicit state/attempt/retry/lease timestamps, sanitized failure classification, actual count |
| `delivery_stories` | Delivery FK, ordered position, nullable live cluster/summary FKs, durable non-personal cluster reference/version/language snapshot, update flag |

Email normalization is deliberately conservative: trim and lowercase the complete address. Bulletin does not apply provider-specific Gmail dot or plus-address rewriting. A database unique constraint on `subscribers.email` is the structural duplicate-account barrier. Email is never an access credential.

The delivery idempotency barrier is the unique constraint on `(subscriber_id, scheduled_for)`. It is independent of worker or cron identity and therefore survives retries, overlaps, restarts, and timeouts.

### Verification, rate-limit, and owner-access technical data

| Table | Purpose |
|---|---|
| `admin_access_tokens` | Hashed owner identity and one-time token only; no raw email or token |
| `admin_sessions` | Hashed owner identity, session token and CSRF token, expiry/use/revocation |
| `rate_limit_buckets` | Scope, hashed subject, fixed window, atomic count and expiry |

Token/session tables never store raw bearer values. The application will create cryptographically random values in trusted server code and store only SHA-256/HMAC-derived 32-byte hashes. Subscriber management sessions are invalidated when `subscribers.token_version` changes.

### Shared public-news data

| Table | Purpose and principal columns |
|---|---|
| `sources` | Verified feed identity/provenance/scope, language/geography, reliability/role flags, terms state, health, conditional request state, schedule, failure counters, lease |
| `articles` | Source FK, original and normalized metadata, unique canonical URL hash, title hash, publication/geography, bounded raw JSON, local classification/entities/event signals, explicit processing/retry/lease state |
| `story_clusters` | Public cluster identity, lifecycle/category/geography/topics/entities/evidence/sensitivity, meaningful-update lineage, current version, event/verification/retention timestamps |
| `story_cluster_articles` | Many-to-many evidence relationship with decision, method, safe metadata, and version introduced |
| `cluster_summaries` | Unique cluster/version/language result, strict status, content fields, attribution/verification JSON, prompt/schema/provider/model metadata |
| `cluster_summary_articles` | Ordered, foreign-keyed evidence citations for each shared summary |

An article cannot be deleted while it is evidence for a live cluster or summary. Deleting an expired cluster cascades its summaries and evidence joins. Delivery history keeps the cluster's public UUID/version snapshot even after its shorter-lived live FK becomes null.

### Operations data

| Table | Purpose |
|---|---|
| `admin_audit_log` | Append-only action/outcome/request IDs and explicitly safe metadata; subscriber FK becomes null on deletion |
| `alert_events` | Deduplicated severity/state/count and safe operational details |
| `worker_heartbeats` | Non-personal worker start/completion/failure health |

Audit metadata must never include names, email addresses, preferences, tokens, article payloads containing PII, or private URLs.

## Constraints and indexes

Important database checks include:

- Trimmed lowercase valid-shape email, unique email, trimmed name, and coherent pending/active/paused timestamps.
- Two-letter uppercase country codes and a required state/region matching the approved Phase 1 validator.
- One to eight unique categories; no duplicate, blank, non-normalized, or over-80-character topics; no more than five positive or excluded topics.
- Story count from one through ten and preference version at least one.
- Weekly day present only for weekly schedules.
- Exactly one active verification token per subscriber.
- 32-byte hashes for tokens, sessions, CSRF values, rate-limit subjects, URLs, and normalized titles.
- Coherent lease triples: token, owner, and expiry are all null or all populated.
- Verified clusters require a verification timestamp and sufficient/strong evidence.
- Verified summaries require all content, provenance, model, and verification fields.
- Terminal delivery timestamps must agree with terminal state.

Indexes cover normalized email (the unique constraint), due source fetching,
due article processing, bounded recent rule-based cluster candidates, source
health, token/session expiry, preference retention, due delivery work,
subscriber delivery history, repeat suppression, cluster/article joins,
alerts, and audits.

## RLS and service-role boundary

All 20 public tables have both RLS and `FORCE ROW LEVEL SECURITY` enabled. Each has one `FOR ALL TO service_role` policy. `anon` and `authenticated` have:

- No table policy.
- No table or sequence privilege.
- No function execution privilege.
- No access to `bulletin_private`.

This is intentionally fail-closed. Bulletin does not use Supabase Auth identities as subscriber identities in the MVP, so there is no safe browser-row policy to add. Browsers call server routes; trusted server routes call reviewed RPCs or perform tightly scoped service-role work. The service-role secret must never enter browser code, cookies, logs, public environment variables, or untrusted workers.

Unused Supabase Auth signup is disabled in the project configuration; Bulletin's subscriber records are not password or Supabase Auth accounts.

Supabase documents that a genuine service-role authorization bypasses RLS. RLS therefore protects browser and accidental low-privilege access; it is not a substitute for keeping the service credential inside trusted server-only boundaries. If a user JWT replaces the authorization header, the user receives the fail-closed browser role rather than service access.

Default privileges also revoke future public-table, sequence, and function exposure. Each later migration must opt in deliberately.

## Atomic subscriber functions

All functions are `SECURITY INVOKER`, use `search_path = ''`, schema-qualify relations, and are executable only by `service_role`.

- `create_pending_subscriber` creates identity, preferences, and schedule in one transaction. A live existing email returns only an outcome and ID; it never overwrites data. An expired seven-day pending row is deleted and recreated atomically.
- `issue_verification_token` increments the subscriber generation, invalidates the previous active hash, and inserts one 24-hour token.
- `inspect_verification_token` is stable/read-only and supports scanner-safe GET pages.
- `consume_verification_token` is the deliberate POST primitive: it locks token/subscriber/schedule, rejects expired or superseded data, consumes once, activates delivery, and calculates the first UTC slot.
- `save_subscriber_preferences` locks the complete current state, requires the expected version, records the previous snapshot, updates identity/preferences/schedule, increments once, and cancels stale queued work in one transaction.
- `save_subscriber_theme` is the only immediate preference save. It still snapshots and increments the preference version atomically, then updates unrendered queued delivery snapshots.
- `invalidate_subscriber_access` increments one subscriber's token version and revokes all management sessions.
- `pause_subscriber` clears the next slot and atomically cancels work that has not crossed the guarded SMTP boundary.
- `resume_subscriber` calculates the next normal future slot; it never creates catch-up work.
- `delete_subscriber` emits a deliberately non-identifying audit event and deletes the subscriber root row. Cascades remove personal data immediately.
- `consume_rate_limit` atomically increments a hashed fixed-window bucket and reports whether the limit is still allowed.

Optimistic version conflicts use SQLSTATE `40001`; the transaction rolls back, so the previous preferences and schedule remain intact.

## Scheduling, claims, and idempotency

`compute_next_delivery_at` evaluates the subscriber's local calendar using the stored IANA timezone and returns a strictly later UTC instant. Daily, weekday, weekend, and weekly calendars are database-tested. PostgreSQL's documented timezone conversion supplies deterministic behavior for DST gaps and repeated times.

`enqueue_due_deliveries` locks a bounded due set with `FOR UPDATE SKIP LOCKED`, inserts the unique delivery slot, and advances `next_delivery_at` in the same transaction. A repeated/overlapping scheduler sees an advanced schedule or loses the unique insert, so it cannot create a second delivery.

Source, article, and delivery claim functions:

1. Select a small ordered due batch with `FOR UPDATE SKIP LOCKED`.
2. Generate an unguessable lease token and store worker ID plus expiry.
3. Return only claimed IDs/tokens.
4. Require the same row and lease token for completion/failure.
5. Permit another worker to reclaim after lease expiry.
6. Reject invalid state transitions and unbounded batch/lease inputs.

The delivery worker must move through claim, render, `begin_delivery_send`, and completion. `begin_delivery_send` is the mandatory final database gate immediately before SMTP; it locks the subscriber and preference record and cancels instead of sending if the account is no longer active or the preference version changed. A stale lease cannot complete or retry another worker's job.

## Cascade and deletion behavior

| Parent deletion | Behavior |
|---|---|
| Subscriber | Cascades preferences, schedules, preference history, verification data, subscriber sessions, deliveries, and delivery stories |
| Subscriber from audit log | `SET NULL`; audit keeps only non-identifying operation metadata |
| Source referenced by an article | `RESTRICT`; evidence cannot be orphaned accidentally |
| Fallback source | `SET NULL` |
| Story cluster | Cascades cluster evidence and summaries; live delivery-story FK becomes null while the non-personal reference/version snapshot remains |
| Summary | Cascades its citations; delivery summary FK becomes null |
| Article used as cluster/summary evidence | `RESTRICT` until the owning evidence is removed |

Deleting a subscriber never deletes sources, articles, clusters, or shared summaries. No database function deletes a subscriber on a GET-style token inspection.

## Retention foundations

`apply_retention(now, batch_size)` is a bounded daily cleanup function. Run it repeatedly until every returned count is zero.

| Data | Enforcement foundation |
|---|---|
| Raw RSS JSON | Null after 14 days; normalized article/evidence fields remain while referenced |
| Story clusters and summaries | Explicit `retention_until`, refreshed for verified meaningful versions; default 30 days |
| Delivery records | Delete terminal rows after 90 days |
| Preference versions | Delete after 30 days |
| Unverified signups | Subscriber-root deletion after seven days, cascading all pending personal data |
| Verification/admin tokens and sessions | Delete when expired, consumed, invalidated, or revoked |
| Rate-limit buckets | Delete after their window expiry |
| Confirmed subscriber data | Retain until deliberate deletion |

The cleanup deletes only orphan articles after 30 days. Foreign keys prevent it from removing live evidence.

## Migration workflow

The repository uses versioned forward-only Supabase migrations:

1. Start local Supabase: `npm run db:start`.
2. Add a new timestamped SQL file under `supabase/migrations/`. Never edit a migration already deployed remotely; create a forward migration instead.
3. Rebuild locally: `npm run db:reset`.
4. Run pgTAP: `npm run db:test`.
5. Run the PostgreSQL linter: `npm run db:lint`.
6. Run all database validation: `npm run db:verify`.
7. Review `npx supabase migration list` before any future `npx supabase db push` to a linked project.

Production deployment is intentionally not part of Phase 2. No remote project was linked or modified.

## Validation completed

- Clean migration reset: passed.
- pgTAP database suite: 59 passed, including all three worker lease families, 100 simultaneously due subscribers, and 1,000 atomic preference saves.
- Supabase database lint at warning level: passed after removing the one shadowed-loop-variable warning.
- Phase 1 ESLint, TypeScript, unit tests, and production build: rerun as part of final validation.

The database tests cover schema/RLS/grants, duplicate signup protection, non-overwrite behavior, one-active-token invalidation, scanner-safe inspection, one-time verification, explicit expired-token rejection, preference snapshots and rollback, theme versioning, DST calculation, 100-subscriber scheduler idempotency, disjoint delivery batches, source/article lease ownership and stale-token rejection, 1,000 monotonic transactional saves and snapshots, guarded delivery states, subscriber deletion, shared-data survival, and expired-pending retention.

### Verification fixture maintenance — 14 July 2026

The pgTAP verification-token fixture now anchors active and expired scenarios to one transaction-stable database timestamp instead of fixed calendar dates. Active-token coverage asserts a safe remaining lifetime relative to execution; separate inspection and consumption assertions evaluate a token 25 hours after issue and confirm fail-closed expiry behavior. This was a test-only maintenance change: no migration, database behavior, or Phase 3 onboarding behavior changed.

## Phase 3 handoff — Onboarding

Phase 2 is complete. The next implementation phase is Phase 3: the five-step subscriber onboarding experience. Do not rebuild, replace, consolidate, or casually edit the Phase 2 migrations, schema, constraints, RLS policies, database functions, or tests.

Before starting Phase 3, the next task must read completely:

1. `docs/BULLETIN_MASTER_PROJECT_CONTEXT.md`
2. `docs/PHASE_1_FOUNDATION.md`
3. This Phase 2 record
4. Every applicable `AGENTS.md`

The owner will provide the approved onboarding design prompt separately. Use it as the visual direction while treating the master project context as authoritative for product behavior. Codex will create the onboarding design because the originally planned external design attempt could not be completed.

### Phase 3 scope

Build the smooth, responsive Light Editorial onboarding experience with:

1. **About you** — required name and email, including the designed states for early email checking.
2. **Location and language** — country, required state/region, optional city, English/Hindi/Malayalam, and editable IANA timezone.
3. **Interests** — one to eight categories, up to five custom topics, and up to five excluded topics.
4. **Delivery** — one to ten stories, the four confirmed frequencies, conditional weekly day, and exact local delivery time.
5. **Review** — readable grouped summary, Edit links, required unchecked consent, and the exact final CTA **Generate my briefing**.
6. The calm post-submission **Check your inbox** visual state.

Implement current-tab draft preservation, backward navigation without data loss, step-aware inline validation, keyboard and screen-reader behavior, mobile keyboard safety, reduced motion, responsive layouts, loading/error states, and review-to-step editing. Reuse the Phase 1 product configuration and validation rules rather than duplicating or weakening them.

### Phase boundary

Phase 3 may create the production-quality onboarding UI, its client-side state machine, validation, and testable server boundaries. Do not silently begin the Phase 4 secure-access work: real verification email delivery, signed management links, token-to-cookie sessions, Manage briefing, pause/resume management UI, or deletion confirmation belong to Phase 4.

If the onboarding submission is not yet connected to the Phase 4 verification-email path, make that boundary explicit. Do not pretend that an email was sent by a production service. Use controlled development/test behavior until the secure flow is implemented.

Do not redesign the landing page, add new fields, introduce passwords or social login, add age/date-of-birth collection, add publisher selection, move theme selection into onboarding, or modify any approved product behavior.

### Phase 3 validation expectations

At minimum, verify:

- All five steps and Edit links preserve values correctly.
- Refresh protection remains limited to the current browser tab and clears after successful completion.
- Every field rule matches the shared validator and database constraints.
- Existing-email states cannot overwrite stored preferences or expose them in the UI.
- Consent is unchecked by default and required.
- Weekly day is required only for weekly delivery.
- Category/topic limits are enforced accessibly.
- Desktop, tablet, mobile, keyboard-only, and reduced-motion behavior work.
- Phase 1 and Phase 2 test suites still pass.
- No Phase 4 functionality or unrelated product page is started.
