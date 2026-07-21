# Bulletin Phase 8 — Personalization and Scheduling

> **Status:** Complete and verified locally on 19 July 2026  
> **Scope:** Deterministic explicit-preference selection, repeat suppression,
> shared-language lookup/queueing, timezone-safe delivery slots, atomic ordered
> delivery-story snapshots, leases, recovery, RLS, and a protected worker route  
> **Remote changes:** None. No production Supabase, deployment, Cron, SMTP,
> subscriber data, or external system was read or changed. No Groq or other
> provider request was made.

## 1. Outcome

Phase 8 turns due active subscribers and Phase 7 verified shared stories into
resumable pending delivery records with an exact ordered story snapshot.

The completed flow is:

1. lock a bounded set of confirmed, active, unpaused due schedules with
   `FOR UPDATE SKIP LOCKED`;
2. calculate the normal news-window start, next local-calendar delivery, and
   both UTC instants using the subscriber's IANA timezone;
3. insert at most one delivery for `(subscriber_id, scheduled_for)` and advance
   the schedule in the same database transaction;
4. claim pending personalization work through a separate expiring lease;
5. load only current verified, non-conflicted, in-window cluster versions with
   a locally verified canonical English summary;
6. apply repeat suppression, explicit category/custom-topic eligibility,
   central-topic exclusions, verified language availability, the centralized
   quality score, category diversity, and subject diversity;
7. idempotently queue one shared Phase 7 localization when a strong Hindi or
   Malayalam candidate has no verified localization;2
8. atomically store the exact ordered cluster version, summary, language,
   update flag, score, reason snapshot, and subject key in `delivery_stories`;
9. mark the delivery personalization snapshot ready, including an honest zero
   or short story count; and
10. permit the existing rendering/send lease to claim only ready snapshots.

The implementation contains no embedding, vector, behavioral, recommendation,
or per-subscriber model path. It does not regenerate summaries. Subscriber
data never enters Phase 7 provider code.

## 2. Final architecture

The protected Node.js route is:

- `POST /api/internal/personalization`

It uses the existing timing-safe `Authorization: Bearer <CRON_SHARED_SECRET>`
boundary and returns only aggregate counts. It calls one server-only service:

- `apps/web/src/services/personalization.ts`

That service coordinates the database adapter in
`apps/web/src/data/personalization.ts` and the pure deterministic rules in
`apps/web/src/lib/personalization/rules.ts`.

The scheduler and selector run in one small resumable batch invocation, but
their leases and states remain independent:

- scheduling owns the unique subscriber/UTC-slot transaction;
- personalization owns `personalization_lease_*` and leaves the delivery in
  its Phase 9 pending state;
- Phase 9 rendering/sending owns the original `lease_*` fields and cannot
  claim a delivery before `personalization_status = 'ready'`.

This separation makes request timeouts and worker restarts safe without adding
another queue service or table.

## 3. Eligibility and selection rules

The pure selector follows the master-context sequence.

Hard gates:

- cluster status must be `verified`;
- evidence strength must be `sufficient` or `strong`;
- conflict details must be empty;
- the current cluster version must be inside the stored delivery window;
- verified canonical English must exist and its local verification record must
  have passed;
- a selected category or an independently matching custom topic is required;
- a normalized central excluded-topic match blocks the story;
- incidental wording in a headline or summary does not trigger an exclusion;
- a version at or below the subscriber's highest previously stored version is
  blocked;
- only a verified summary in the delivery language may be selected; and
- the score must meet the fixed quality floor.

Custom topics match normalized central topics, principal entity values, or the
canonical headline. Exclusions intentionally match only normalized
`central_topics`, preventing incidental mentions from becoming hard blocks.

The database repeats the safety-critical mutable-state checks at completion:
active/verified subscriber, unchanged preference version, current verified
cluster version, verified language summary, in-window event time, requested
count, contiguous positions, active lease, and no already-delivered same/newer
version.

## 4. Centralized scoring configuration

All numeric values live in the immutable `PERSONALIZATION_RULES` object beside
the pure selector. No ranking number is scattered through a query or service.

| Signal | Phase 8 default |
|---|---:|
| Selected category | +18 |
| Direct custom-topic match | +24 |
| India-wide/national geography | +14 |
| Subscriber state | +9 |
| Subscriber city | +6 |
| Strong / sufficient evidence | +14 / +8 |
| Tier 1 / Tier 2 / Tier 3 source | +10 / +7 / +4 |
| Factual depth 0–3 | +0 / +3 / +6 / +9 |
| Recency across the exact window | 0 to +14 |
| Meaningful newer version | +8 |
| Additional independent evidence | +2 each, capped at +6 |
| Repeated category rerank penalty | −3 per prior selection |
| Repeated subject rerank penalty | −12 |
| Minimum quality score | 45 |

Geographic tiers are mutually exclusive, which preserves the confirmed
national → state → city order instead of accidentally making city scores
additive. Recency is deterministic within the stored window. A cluster version
above one is a meaningful update because Phase 7 advances `current_version`
only for a meaningful factual development.

For diversity:

- requested counts of 3–4 normally permit at most two stories in one category;
- requested counts of 5–10 use `floor(count × 0.40)`;
- one selected category removes the category cap;
- a category cap is relaxed only when no in-cap eligible candidate remains;
- a repeated normalized subject receives a rerank penalty; and
- neither diversity rule can add a candidate below the quality floor.

The result may be shorter than requested or empty. There is no fallback
recommendation or importance-based insertion outside preferences.

## 5. Language handling

English remains canonical. Candidate loading always requires a verified
English summary. For English deliveries that summary is selected directly.

For Hindi or Malayalam:

- an existing verified localization is selected;
- missing localization makes that candidate unavailable for the current
  delivery;
- up to the requested count of the strongest otherwise-eligible missing
  candidates are queued through Phase 7's existing
  `enqueue_cluster_localization` RPC;
- its unique cluster-version-language constraint makes retries idempotent; and
- other verified inventory is used, or the delivery remains short/empty.

Phase 8 does not run the shared-summary worker and consumes no provider quota.

## 6. Scheduling calculations

`compute_next_delivery_at` remains the Phase 2 forward local-calendar
calculator. Phase 8 adds `compute_delivery_window_start`, the reverse
local-calendar counterpart used for relevant-news windows.

Both functions:

- validate the stored IANA timezone against PostgreSQL's timezone catalogue;
- construct local calendar dates at the subscriber's exact local time;
- convert those dates to UTC with PostgreSQL timezone rules; and
- support daily, weekdays, weekends, and weekly schedules.

The reverse calculator gives:

- daily: previous local calendar day;
- weekdays: previous weekday, so Monday starts at Friday's delivery time;
- weekends: previous Saturday/Sunday delivery day;
- weekly: previous chosen weekday, normally seven days; and
- DST gaps/repeated times: PostgreSQL's deterministic normalized UTC instant.

At scheduling time the news window starts at the later of the normal calendar
start and the most recent successful briefing. This prevents a window from
growing beyond the confirmed frequency after failures while still honoring an
available prior success.

If stored timezone/schedule data becomes invalid, that subscriber is isolated:
no delivery is created, `next_delivery_at` becomes null, and
`schedule_error_code = 'invalid-schedule-data'` is recorded. Other due rows in
the batch continue. A later valid schedule update or resume clears the error.

## 7. Database changes

Forward-only migration:

- `supabase/migrations/20260719120000_phase_8_personalization_and_scheduling.sql`

It adds:

- the `personalization_status` enum;
- visible schedule error state;
- stored news-window start/end on each delivery;
- independent personalization attempt, retry, lease, failure, completion,
  version, and metadata fields;
- selection score/reasons/subject audit fields on ordered delivery stories;
- due/repeat indexes and consistency constraints;
- automatic cancellation cleanup for in-progress personalization leases;
- the reverse delivery-window calculator;
- the enhanced atomic due-delivery transaction;
- personalization claim/context/candidate/complete/fail RPCs; and
- a guarded replacement for `claim_deliveries` that accepts only ready Phase 8
  snapshots.

No migration history was deleted or rewritten. The existing delivery table,
ordered story table, unique slot constraint, cascade model, and RLS policies
were extended in place.

## 8. Security and RLS

- All scheduling and selection modules import `server-only`.
- The internal route uses the existing cron secret with timing-safe comparison.
- The route is Node-runtime, private/no-store, and returns aggregate counts only.
- Logs contain delivery UUIDs and safe error codes, never subscriber email,
  names, tokens, private URLs, secrets, or preference payloads.
- No service-role value enters browser code.
- Existing forced RLS remains on all 20 public tables.
- Browser roles retain no table access and cannot execute any Phase 8 RPC.
- Only `service_role` receives the reviewed function grants.
- Candidate/context reads require the active personalization lease.
- Delivery completion revalidates subscriber status and preference version in
  the same transaction as the ordered story inserts.

## 9. Recovery and idempotency

- `(subscriber_id, scheduled_for)` is the permanent duplicate-delivery barrier.
- Due schedules use row locks plus `SKIP LOCKED`; the unique insert and next UTC
  slot commit together.
- Request timeout after commit is safe: retry sees the advanced schedule or the
  existing unique slot.
- Personalization claims use owner, token, expiry, attempt count, retry time,
  and a five-attempt terminal limit.
- Active leases cannot be stolen; expired leases receive a fresh token.
- Stale tokens cannot complete or fail another worker's work.
- Ordered story insertion and ready-state completion are one transaction.
- Completion rejects a same/newer already-stored cluster version.
- Localization queueing is unique and idempotent per shared cluster version and
  language.
- Pause/cancellation clears an in-progress personalization lease.
- Phase 9 cannot claim rendering/sending work before the Phase 8 snapshot is
  ready.

## 10. Tests and results

Final local validation on 19 July 2026:

- ESLint: passed;
- TypeScript: passed;
- ordinary Vitest suite: 40 files passed, 6 opt-in files skipped as expected;
  175 tests passed;
- focused Phase 8 unit/service/route suite: 15 tests passed;
- Next.js 16.2.10 production build: passed and includes
  `/api/internal/personalization`;
- clean local Supabase replay: all Phase 2–8 migrations and seed applied from
  scratch;
- full pgTAP suite: 233 assertions passed across five database files, including
  40 Phase 8 assertions;
- strict `public,bulletin_private` database lint: zero errors or warnings; and
- deterministic real local Phase 8 integration: one due subscriber created one
  UTC-slot delivery, one verified shared story was selected and stored in
  order, a retry created no work, and no live provider or email was used.

Coverage includes selected categories, independent custom topics, central
versus incidental exclusions, national/state/city order, evidence/source/depth
signals, recency, meaningful updates, repeat suppression, category and subject
diversity, one-category relaxation, quality-floor short/empty results, English
and localized inventory, idempotent missing-localization queueing, all four
frequencies, Monday gap, multiple IANA zones, DST forward/backward, duplicate
scheduler calls, disjoint/expired leases, stale-token rejection, atomic exact
story storage, RLS/function grants, and zero provider quota consumption.

The build still emits the existing Supabase warning that Node.js 20 and below
will lose support in a future release. The repository currently satisfies its
Node 20.19 floor; move to Node.js 22 before that warning becomes a hard
dependency requirement.

## 11. Known limitations

- Topic matching is deliberately lexical and rule-based. It may miss a synonym
  not present in Phase 7 central topics/entities/headline; it will not spend a
  model call or introduce an embedding system to guess.
- Local source supply may still yield short or empty briefings. Phase 8 does not
  weaken the evidence or scoring floor.
- Missing Hindi/Malayalam inventory is only queued here. A later invocation can
  select it after the existing Phase 7 summary worker verifies it.
- The current batch defaults are conservative and intended for the 50–100 user
  private-beta target; production timing still requires Phase 10 Cron and soak
  testing.
- No HTML/plain-text email rendering, SMTP, production Cron, deployment,
  operations UI, alerts, or backup work is part of Phase 8.

## 12. Exact Phase 9 handoff

Phase 9 must start from `deliveries.personalization_status = 'ready'` and use
the existing guarded `claim_deliveries` RPC. It must:

1. load `delivery_stories` in ascending `position` and render exactly those
   stored cluster versions and summary IDs;
2. never rerank, replace, regenerate, or silently drop a stored story except by
   failing the pending delivery visibly when mutable evidence is no longer
   safe;
3. use the delivery's stored language/theme/preference snapshot and actual
   story count, including honest empty briefings;
4. render real source attribution/original links and all four email themes in
   HTML and plain text;
5. keep `begin_delivery_send` as the final active-subscriber/preference-version
   database gate immediately before SMTP;
6. implement bounded temporary SMTP retries and terminal permanent failure;
7. add owner-only operations, alerts, encrypted backup automation, retention
   verification, and restore proof required by the Phase 9 scope; and
8. preserve the Phase 8 slot, selection, repeat, localization, lease, RLS, and
   no-behavioral-tracking guarantees.

Phase 8 configured no production Cron and sent no email. Phase 9 and Phase 10
still require separate explicit approval.
