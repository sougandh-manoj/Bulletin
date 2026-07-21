# Phase 10 Load and Failure-Test Results

Run date: 19 July 2026. Destructive cases used local disposable fixtures/fake transports; no malformed or duplicate real email was sent.

## Load/concurrency

| Case | Evidence | Result |
|---|---|---|
| 100 subscribers due together | Five overlapping scheduler RPCs; exact query of fixture subscribers | 100 unique UTC slots, zero duplicates, under five minutes |
| Thousands of preference updates | 100 subscribers × 20 versioned saves | 2,000 exact versions and 2,000 preserved snapshots; no conflict/loss |
| Duplicate/overlapping scheduler | Same concurrent run plus existing database suites | Pass |
| Overlapping delivery/source/article/personalization workers | Existing `SKIP LOCKED` database suites | Pass |
| Expired leases/restarts | Phase 2/7/8/9 database suites plus Phase 10 fresh-lease migration | Pass |

The dedicated load test completed in 32.18 seconds on the local Mac/Supabase stack. This is not production timing evidence; the 99% within-five-minutes gate requires production soak measurements.

## Failure injection covered by deterministic fixtures

- RSS timeout, redirect/SSRF rejection, malformed XML/Atom, entity/doctype rejection, oversized payload, disabled/broken feed, Retry-After, and isolated source failure.
- Provider timeout/retry status, malformed JSON/schema, unsupported facts/numbers/citations, quota exhaustion, unavailable/auth circuit, and no repair call.
- Temporary/permanent SMTP classification, rejected recipient, ambiguous acceptance, expired sending lease, bounded retry, and no resend after success.
- All frequencies, multiple timezones, DST transitions, same-day preference versions, link expiry/replay, scanner-safe GET/POST, uniqueness, deletion, owner authorization, kill switches, backup tamper/wrong-key, retention, and alert deduplication.
- Clean isolated replay applied 26 migrations; Phase 10’s 8 bootstrap assertions and all prior phase database suites passed after test-only enablement of controls.

## Still requiring production evidence

- Forced Vercel function timeout/termination during real hosted stage boundaries.
- Real Gmail temporary/permanent behavior without deliberately sending malformed/duplicate mail.
- Scheduled offsite backup is intentionally deferred for the personal beta by owner decision; existing local backup tests are not a launch gate.
- Real browser and email clients.
- Production owner smoke, scheduled briefing timing distribution, worker/alert observation, and 7–14 day soak.
