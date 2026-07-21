# Bulletin Phase 9 — Briefing Delivery and Operations

> **Status:** Complete and verified locally on 19 July 2026  
> **Scope:** Exact stored-selection rendering, four email themes, receipt-aware
> SMTP delivery, bounded recovery, owner operations, alerting, encrypted backup
> retention, and a clean local restore drill  
> **Remote changes:** None. No production database, deployment, Cron, Gmail,
> Google Drive, subscriber data, or external provider was read or changed. No
> real email was sent and no AI/provider call was made.

## 1. Outcome

Phase 9 turns Phase 8's immutable `delivery_stories` snapshot into one
email-safe HTML message and one useful plain-text alternative. It does not
score, rerank, replace, repair, translate, or regenerate content.

The protected delivery route is `POST /api/internal/delivery`. A cron-secret
authenticated invocation recovers expired work, claims a bounded batch, loads
the exact frozen context, renders it, performs the final database gate, sends
through the existing Nodemailer abstraction, and records the SMTP receipt.
The route returns aggregate counts only.

The other Phase 9 server boundaries are:

- `POST /api/internal/backup` for one encrypted backup run;
- `/internal/access` and `/internal/access/exchange` for owner-only access;
- `/internal/operations` for the private operational surface; and
- `POST /api/internal/owner/action` for narrowly enumerated controls.

All data access, rendering, SMTP, administration, alerting, and backup code is
server-only. No Phase 9 page is linked from public navigation.

## 2. Exact rendering architecture

`load_delivery_render_context` succeeds only while the caller owns a current
delivery lease and the delivery is `claimed` with personalization `ready`. The
database builds each story from the selected `delivery_stories` row and checks:

- ascending, contiguous stored position;
- the exact selected cluster version is still current and verified;
- the exact selected summary ID, language, and cluster version are verified;
- no conflict details exist;
- stored headline, summary, why-it-matters, update flag, category, source name,
  reviewed HTTPS icon (when present), and direct article URL are available; and
- loaded story count equals `actual_story_count`.

An integrity failure permanently fails the pending delivery visibly. The
renderer never substitutes inventory and never calls Groq, Gemini, or another
provider. Honest short and zero-story snapshots render as-is.

The final output contains the Bulletin masthead, localized date, actual count,
category, exact stored headline and summary, stored why-it-matters text, stored
update label, exact publisher attribution, direct original links, a
subscriber-specific footer, and a newly signed Manage briefing URL. Publisher
icons appear only when a reviewed normalized icon URL is stored; otherwise the
publisher-name link is used. Links contain no click IDs, UTM parameters, or
other tracking additions.

The HTML uses presentation tables, explicit backgrounds, inline typography and
spacing, conservative mobile CSS, semantic headings, decorative empty-alt
icons, visible link text, and a plain-text sibling. It declares a fixed color
scheme so the two deliberately fixed themes are not unpredictably inverted.

### Themes

| Stored value | User-facing design | Rendering character |
|---|---|---|
| `light-editorial` | Light Editorial | warm ivory, charcoal, editorial blue, serif headlines |
| `dark-intelligence` | Signal Brief | pale blue, near-black, restrained analytical sans-serif styling |
| `midnight-brief` | Midnight Brief | fixed near-black, warm ivory copy, editorial blue details |
| `amber-brief` | Amber Brief | fixed ivory, charcoal and gold editorial palette |

## 3. Language, date, and subject handling

The stored delivery language is authoritative. Only `en`, `hi`, or `ml` reaches
the renderer, and every non-English story must already reference a verified
shared Phase 7 localization. Dates use `Intl.DateTimeFormat` with `en-IN`,
`hi-IN`, or `ml-IN` and the delivery's stored IANA timezone.

The non-clickbait subject is localized as `<Your Bulletin> - <local date>`.
The deterministic English fixture is `Your Bulletin - 12 July 2026`; Hindi and
Malayalam use their localized masthead and locale-native date representation.
Static labels and zero-story copy are localized in the same three languages.

## 4. Delivery state machine and idempotency

The delivery states are deliberately small:

```text
pending/retry-wait + personalization ready
  -> claimed -> rendering -> sending -> sent
                       |          |
                       |          +-> failed (ambiguous SMTP outcome; never resend)
                       +-> retry-wait or failed

pending/claimed/rendering/retry-wait -> cancelled (final subscriber/owner gate)
```

Detailed rules:

1. `claim_deliveries` uses `FOR UPDATE SKIP LOCKED`, due time, kill-switch,
   active subscriber, ready personalization, and attempt bounds. It increments
   `attempt_count` when issuing a unique expiring lease.
2. The renderer loads only the exact lease-bound snapshot and
   `mark_delivery_rendered` moves `claimed` to `rendering`.
3. `begin_delivery_send` is the final database action immediately before SMTP.
   It rechecks the email kill switch, active/current subscriber, unchanged
   preference version, ready snapshot, and lease. A stale subscriber or
   preference cancels; an active kill switch defers without sending.
4. The same transaction inserts a `delivery_send_attempts` row before moving to
   `sending`. SMTP acceptance is completed only by
   `complete_delivery_send_with_receipt`, which stores the bounded provider
   message ID and marks both delivery and attempt successful. The old
   receipt-less Phase 2 completion function is removed.
5. A temporary SMTP or transport failure schedules approximately 5, 15, then
   60 minutes. Four automated attempts are the maximum. SMTP 5xx, authentication,
   envelope/message failures, rejected recipients, and rendering-integrity
   failures stop immediately. SMTP 4xx, timeout, connection, socket, reset, and
   DNS failures are temporary.
6. An owner may grant one additional immediate retry only to a failed,
   non-permanent temporary delivery. Sent, cancelled, permanent, and already
   manually retried deliveries remain ineligible.
7. Expired `claimed` or `rendering` work returns to `retry-wait`. Expired
   `sending` work becomes an explicit ambiguous permanent failure and generates
   a critical alert; it is never resent. If SMTP accepts but database completion
   is lost or the request times out, the same no-resend rule applies.

The original unique `(subscriber_id, scheduled_for)` slot, lease ownership,
attempt uniqueness, success terminal state, and final subscriber gate together
make duplicate cron calls, overlapping workers, restarts, and request retries
safe.

## 5. SMTP configuration and safe logging

`EMAIL_TRANSPORT=test` uses Nodemailer's non-sending JSON transport. Production
requires `EMAIL_TRANSPORT=smtp`, a dedicated `GMAIL_SMTP_USER`, and
`GMAIL_SMTP_APP_PASSWORD`; Gmail uses TLS on `smtp.gmail.com:465`. SMTP secrets,
service-role credentials, recipient addresses, raw sessions, signed management
URLs, and provider keys are never logged. Delivery logs contain bounded IDs,
safe error codes, transport kind, and terminal classification only.

## 6. Owner operations and alerts

The owner requests a short-lived email link using the allowlisted
`OWNER_EMAIL`. The public request response is deliberately identical for every
valid email submission, preventing discovery of the owner allowlist. Only the
matching address receives a link. Only token hashes are stored; exchange
consumes the token once and issues a short-lived,
secure, HttpOnly, `SameSite=Strict` admin cookie plus a CSRF binding. Dashboard
loads and mutations validate the session server-side. Mutations additionally
enforce same-origin and CSRF checks.

The dashboard shows aggregate subscriber and delivery counts, recent safe
delivery state, retries and failures, source/intelligence failure totals,
worker heartbeat and stalled-lease evidence, system controls, deduplicated
alerts, and encrypted backup/restore proof. It does not display subscriber
email addresses or private links.

Allowed actions are limited to:

- global email delivery pause/resume;
- ingestion, intelligence, and personalization worker pause/resume;
- cancel a pending unsent delivery; and
- one bounded retry of an eligible temporary failure.

Each action executes an audited database function with a request ID. There is
no preference editing, impersonation, evidence override, success resend, or
unbounded permanent retry. Alerts deduplicate by key and accumulate occurrence
counts. Critical email notification has a six-hour cooldown, preventing alert
storms while keeping the dashboard state current.

## 7. Security and RLS

`delivery_send_attempts`, `system_controls`, and `backup_runs` force RLS and are
service-role only, as are the operational RPCs. Browser roles receive no table
or RPC access to other subscribers' deliveries, attempts, alerts, sessions,
controls, or backups. Existing Phase 4 subscriber sessions and management-link
HMAC/version checks are unchanged. Internal delivery and backup routes reuse
the timing-safe bearer-secret boundary. Secrets remain server environment
values and the production client bundle is scanned for secret markers.

## 8. Backup, retention, and restore

The backup route runs `pg_dump` in custom format for Bulletin's `public`,
`bulletin_private`, and `extensions` schemas. The dump is encrypted before any
storage call with AES-256-GCM, a random 96-bit nonce, authenticated format
header, and a separately supplied 32-byte base64url key. The encrypted object's
SHA-256 checksum, size, adapter, status, and safe retention metadata are stored
in `backup_runs`; keys are never stored with the backup.

The storage interface has local, fake-test, and Google Drive implementations.
Google Drive accepts only an injected client plus folder ID: Phase 9 defines
and tests the boundary but intentionally supplies no live OAuth client and
performs no upload. Retention keeps one representative for each of the newest
seven UTC days plus one for each of the newest four ISO weeks, deleting only
objects outside both sets. Backup failure records a critical deduplicated alert.

Run a local restore proof with:

```sh
npm run test:phase9:restore
```

The script exports the local Supabase container, encrypts and decrypts the
artifact, creates a clean `bulletin_phase9_restore` database, removes its empty
schemas, restores the dump, and validates subscribers, preferences, schedules,
deliveries, delivery stories, clusters, summaries, forced-RLS tables, and
critical delivery, clustering, and scheduling functions. It records a
`restore-verified` run and always drops the temporary database.

## 9. Verification completed

The final local gate set passed on 19 July 2026:

- ESLint and TypeScript;
- full Vitest application suite;
- Next.js 16 production build;
- clean Supabase migration reset;
- full pgTAP database suite, including 38 Phase 9 assertions;
- strict database lint with no warnings;
- deterministic non-sending local delivery integration;
- AES tamper/wrong-key and 7-daily/4-weekly retention unit tests;
- encrypted clean-database backup/restore drill;
- production client-asset secret scan; and
- deterministic HTML fixtures plus structural/palette checks for all four
  themes.

The delivery tests cover exact order and content, all themes, HTML/text, short
and empty output, three languages, localized dates/subjects, update labels,
attribution/icons/direct URLs, tracking absence, signed management URLs, stale
preference and inactive-subscriber gates, kill switch, temporary/permanent SMTP
classification, exact retry schedule, no resend after success or ambiguous
acceptance, duplicate/concurrent workers, expired leases, owner authorization,
RLS, safe audits, alert deduplication, and zero provider calls.

Four review fixtures are under `verification/phase9-email/`. The installed
in-app browser refused local `file://` navigation under its URL safety policy,
so no browser screenshot was fabricated or obtained by bypassing that policy.
The fixtures themselves are deterministic and directly openable for later
target email-client review. Table layout and responsive rules are encoded in
the renderer; palette identity, content, ordering, and links are asserted by
the automated suite.

## 10. Known limitations

- Production Cron schedules, Gmail credentials/sending, deployment, production
  migration, and Google Drive authorization/upload were explicitly out of
  scope and remain unconfigured.
- The default exporter requires `pg_dump` in the worker runtime. Phase 10 must
  schedule it in a trusted environment that has compatible PostgreSQL tools.
- The local build uses Node 20.16.0 successfully, but Supabase's client warns
  that Node 20 support will be removed in a future release. Phase 10 should
  deploy on Node 22 or later.
- The application-schema export is the complete Bulletin data/function backup;
  managed Supabase platform schemas are not copied because Bulletin does not
  use Supabase Auth or Storage for subscriber identity.
- Normalized source icons render only when a reviewed HTTPS icon URL is stored;
  current sources without one intentionally show publisher text.
- Final Gmail client-matrix checks, real inbox timing, Safari HTTPS secure-cookie
  verification, load/failure injection, and the 7–14 day soak test are Phase 10
  launch gates.

## 11. Exact Phase 10 handoff

Phase 10 must begin from this locally verified implementation without changing
the Phase 9 state machine or exact-selection contract. In order:

1. re-verify current legal, Gmail, Supabase, Vercel, Google Drive, RSS-use, and
   dependency requirements from primary sources;
2. complete security review and product-specific Privacy Policy and Terms;
3. provision separate production secrets, owner address, Gmail sender,
   Supabase project, and a narrowly authorized Google Drive backup client;
4. deploy, apply forward migrations, and schedule ingestion, intelligence,
   personalization, delivery, and daily backup invocations in an approved
   reliable worker environment;
5. prove encrypted upload/download and clean restore with production-like but
   non-subscriber fixtures before relying on backup status;
6. run Gmail temporary/permanent failure injection, overlapping-worker and
   timeout/crash tests, a 100-subscriber due-slot load test, target browser and
   email-client tests for all four themes, and Safari/Chrome HTTPS secure-access
   flows;
7. confirm the full launch gate, complete a 7–14 day soak test, and verify
   current quota/cost ceilings; then
8. roll out owner accounts, five trusted users, twenty users, and only then the
   fifty-to-one-hundred-user private beta.

No Phase 10 deployment, external mutation, real send, real backup upload, or
subscriber rollout was performed during Phase 9.
