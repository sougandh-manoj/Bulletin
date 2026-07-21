# Bulletin Phase 3 — Onboarding

Status: complete on 13 July 2026.

## Delivered

- A production-quality Light Editorial onboarding route at `/onboarding`
- Five responsive steps covering identity, location/language, interests,
  delivery, and final review/consent
- Controlled early-email checking states for existing and pending subscriber
  designs without displaying or overwriting stored preferences
- Searchable country and Indian state/UT controls, including case-insensitive
  canonical state matching such as `kerala` to `Kerala`
- A reliable searchable IANA-timezone picker with mouse, touch, and keyboard
  selection
- One-to-eight category selection plus accessible five-item custom and excluded
  topic tag limits
- A custom exact-time picker, four frequencies, conditional weekly-day
  validation, and a live delivery summary
- Review-to-step editing, backward navigation, inline validation, loading/error
  states, and an unchecked required consent control
- Current-tab-only draft preservation through `sessionStorage`, cleared after a
  completed onboarding preview
- A calm check-inbox, resend, and different-email visual state
- Keyboard semantics, associated field errors, focus management, reduced-motion
  support, focused-field scroll clearance above mobile virtual keyboards, and
  responsive layouts from wide desktop to 320 px narrow mobile

## Phase boundary

Phase 3 does not create subscriber records, query existing subscriber data,
send email, issue verification tokens, create management sessions, or begin any
other Phase 4 secure-access behavior. The account-check, submission, and resend
responses are controlled frontend simulations and are explicitly identified as
non-sending previews in the interface.

For visual review, `existing@bulletin.test` and `pending@bulletin.test` exercise
the protected email states. `submit-error@bulletin.test` and
`resend-error@bulletin.test` exercise recoverable failure states.

## Validation completed

- ESLint: passed
- TypeScript: passed
- Web unit tests: 16 passed
- Production build: passed
- Phase 2 clean database reset: passed
- Phase 2 pgTAP database suite: 59 passed
- Supabase database lint: passed
- Browser flow: all five steps, field errors, category limit, tags, weekly-day
  reveal/validation, review editing, consent, current-tab refresh recovery,
  completion clearing, existing-account protection, resend state, and the final
  check-inbox state verified
- Responsive visual QA: 1440 px desktop, 834 px tablet, 390 px mobile, and
  320 px narrow mobile; no horizontal overflow at the narrow breakpoint

## Phase 2 maintenance alignment — 14 July 2026

The separately approved Phase 2 maintenance task repaired the date-dependent
verification-token pgTAP fixture. Active and expired token cases now use one
transaction-stable database timestamp, retain explicit fail-closed expiry
coverage, and pass regardless of the calendar date on which the suite runs.

The repair was test-only. It did not add or modify a migration, change database
behavior, or alter any Phase 3 onboarding implementation. The previously noted
Phase 2 test blocker is resolved; no Phase 3 work was skipped because of it.
