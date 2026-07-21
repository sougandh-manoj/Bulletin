# Bulletin Phase 4 — Secure Access

Status: complete on 14 July 2026.

## Delivered

- Phase 3's existing Light Editorial onboarding experience now performs real,
  server-side email checks, subscriber creation, pending-subscriber recovery,
  verification issuance, and resend handling.
- Verified subscribers receive a neutral management-access response while new
  and pending subscribers receive the appropriate protected onboarding state.
  Stored personal data is never returned by the early email check.
- Verification links are scanner-safe: `GET /access/verify` only inspects a
  token, stores a short-lived protected intent, and redirects to a clean
  `/verify` URL. That URL opens Light Editorial, Signal Brief, Midnight Brief, and Amber Brief previews
  directly; **Start my Bulletin** deliberately confirms the email, saves the
  first theme, and activates delivery atomically through `POST`.
- Successful confirmation creates a private subscriber session and opens a
  minimal completion experience with subscription status and the next normal
  delivery slot.
- Signed, expiring management links exchange once into the same private session
  model and redirect to a clean `/manage` URL.
- The management page loads the complete saved preference state and supports
  atomic preference saves, immediate theme changes, pause, and resume. Email
  address changes remain unavailable. Its preference controls reuse the Phase 3
  onboarding visual language: compact fields, selected category pills, topic
  tags, language/frequency cards, the story-count stepper, and exact-time picker.
- Unsubscribe/delete has a separate confirmation page, requires the subscriber
  to type `DELETE`, and performs deletion only through an authenticated,
  same-origin, CSRF-protected `POST`. Refreshing or visiting a link cannot
  delete data.
- Transactional verification and management emails have restrained HTML and
  plain-text versions. Local and automated work uses Nodemailer's non-sending
  JSON transport; production is fail-closed unless SMTP is configured.

## Security model

- Supabase is accessed only from modules marked `server-only` with the service
  role. No Supabase credential or private token is sent to browser code.
- Verification and session bearer values are 256-bit random values. Only
  SHA-256 hashes are stored in PostgreSQL; raw values exist only in email links
  or `Secure`, `HttpOnly`, `SameSite=Strict`, path-wide cookies.
- Management links use independent HMAC-SHA-256 signatures, timing-safe
  comparison, a subscriber public reference, the current token version, and an
  explicit expiry. A token-version change invalidates older links and sessions.
- Subscriber sessions last 30 minutes. Verification intent cookies and signed
  management links last 15 minutes. Verification tokens last 24 hours and
  pending subscriber records expire after seven days.
- Session validation checks hash, optional CSRF hash, expiry, revocation,
  subscriber state, and token version on every protected load or mutation.
- JSON mutation bodies are size-bounded and schema-validated. Protected
  mutations require a valid session, CSRF token, and same-origin request.
- Email checks, issuance/resend, management requests, and token validation use
  database-backed fixed-window rate limits. Network/discriminator subjects are
  HMACed before storage.
- Secure pages and handlers use private/no-store responses, `no-referrer`,
  `nosniff`, and no-index controls. Logs contain action/state metadata, not email
  addresses, raw tokens, signed URLs, cookie values, or secrets. Next.js
  development request logging also ignores the two tokenized exchange routes.
- Sensitive routes return calm, generic states where account enumeration or
  replay details would otherwise leak protected information.

## Server routes

Public entry and exchange routes:

- `POST /api/secure/email/check`
- `POST /api/secure/onboarding`
- `POST /api/secure/verification/resend`
- `GET /access/verify`
- `POST /api/secure/verification/confirm`
- `POST /api/secure/manage/request`
- `GET /access/manage`

Session-protected mutation routes:

- `POST /api/secure/preferences`
- `POST /api/secure/theme`
- `POST /api/secure/delivery`
- `POST /api/secure/delete`

## Database alignment

Phase 2 already supplied the subscriber, token, schedule, session, rate-limit,
and deletion model plus the core atomic functions. Those completed migrations
remain immutable.

The forward-only migration
`20260714193000_phase_4_secure_access.sql` adds the reviewed service-role-only
session boundary required by the web application:

- `create_subscriber_session`
- `validate_subscriber_session`
- `revoke_subscriber_session`

The functions validate 32-byte hashes, verified subscriber state, token
version, revocation, expiry, and CSRF where requested. Execute privileges are
revoked from `public`, `anon`, and `authenticated` and granted only to
`service_role`. The database permits at most a two-hour requested session while
the application deliberately issues only 30-minute sessions.

The forward-only follow-up migration
`20260715023000_phase_4_theme_confirmation.sql` adds
`consume_verification_token_with_theme`, which preserves scanner-safe `GET`
behavior while applying the subscriber's first theme and activation in the
same deliberate transaction.

## Configuration and Gmail setup

Copy `apps/web/.env.example` into the deployment's private environment and set:

- `APP_BASE_URL` to the canonical HTTPS origin
- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
- independent, randomly generated `MANAGEMENT_LINK_SIGNING_SECRET` and
  `SESSION_SIGNING_SECRET` values of at least 32 characters
- `EMAIL_TRANSPORT=smtp` in production
- `GMAIL_SMTP_USER` and `GMAIL_SMTP_APP_PASSWORD`

Use a dedicated Gmail sender account, enable two-step verification, and create
an app password for Bulletin. Do not use a personal account password. SMTP uses
`smtp.gmail.com` on port 465 with TLS. Production startup rejects the safe test
transport or missing SMTP values. No real credentials are committed, and no
deployment or live email was performed as part of this phase.

Node.js 22 or later is recommended for current Supabase client support. The
server includes an explicit WebSocket runtime adapter so the repository's
documented Node 20.19 floor remains functional during the transition.

## Deferred localhost Safari compatibility fix

Verification and management links currently work in Chrome during local
development but fail in Safari when Bulletin is served from plain
`http://localhost`. The emailed token is not necessarily invalid. The exchange
routes set production-grade `Secure`, `HttpOnly`, `SameSite=Strict` cookies
using the `__Host-` prefix; Safari rejects those cookies on a non-HTTPS local
origin. The clean redirect then arrives without the temporary verification or
subscriber-session cookie and falls into the generic invalid/expired state.

This is deferred until after Phase 5 and must be resolved before final
cross-browser and deployment verification. The approved fix must:

- retain `__Host-` cookie names and `secure: true` on canonical HTTPS origins;
- use clearly development-only cookie names without the `__Host-` prefix and
  `secure: false` only for plain local HTTP development;
- centralize that environment-aware cookie policy and apply it consistently to
  verification intent, subscriber session creation, and cookie clearing;
- add automated coverage for both local-development and production cookie
  policies; and
- manually retest complete verification and management-link flows in Safari
  and Chrome.

Do not weaken production cookie security to make localhost work. This deferred
fix is separate from Phase 5 landing-page implementation.

## Validation completed

- ESLint: passed
- TypeScript: passed
- Web unit and route tests: 61 passed across 15 files
- Production build: passed
- Clean local Supabase reset: passed
- pgTAP database suites: 72 passed (59 Phase 2 plus 13 Phase 4)
- Supabase database lint at warning level: zero findings
- Local integration suite: 10 checks passed, including token supersession,
  expiry, two simultaneous confirmation attempts with exactly one winner,
  replay rejection, session validation, CSRF rejection, and revocation
- Browser flow: real new/pending onboarding, safe resend, scanner-safe clean
  verification URL, deliberate confirmation, immediate theme save, atomic
  preference save, pause/resume, deliberate deletion, completion refresh, and
  post-deletion session rejection verified with disposable `.invalid` accounts
- Responsive visual QA: desktop and 390 px mobile management/confirmation
  layouts verified with no horizontal overflow, including selected category
  states, topic tags, delivery cards, and the exact-time picker
- Production client assets scanned for server configuration names and Supabase
  service-role key patterns; no private material found

## Phase boundary and Phase 5 handoff

Phases 1–3 retain their established behavior and visual language; Phase 4 only
replaced the explicitly simulated access boundaries and added subtle access
entry links. No feed ingestion, summarization, ranking, delivery worker, cron,
or deployment work from Phase 5 or later has started.

Phase 5 can consume only active subscribers and their existing schedule and
preference records. It should continue using service-role-only server modules,
the existing atomic delivery primitives, token-version invalidation, private
logging rules, and the secure configuration boundary documented here.
