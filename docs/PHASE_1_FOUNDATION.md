# Bulletin Phase 1 — Foundation

Status: complete on 12 July 2026.

## Delivered

- Next.js 16 App Router application in `apps/web`
- Strict TypeScript, Tailwind CSS 4, ESLint, and production build scripts
- Root npm workspace so later services and shared packages remain in one monorepo
- Central product configuration for identity, defaults, languages, categories,
  themes, frequencies, weekdays, and preference limits
- Shared Zod subscriber-preference validation with email/country normalization,
  category uniqueness, time, timezone, consent, and weekly-day rules
- Server environment validation and a tracked `.env.example`
- A `server-only` boundary for secret-bearing modules
- Structured JSON logging with default redaction for credentials, subscriber
  email addresses, and query/hash values in private URLs
- Unit tests for confirmed configuration, subscriber validation, and log
  sanitization
- A restrained Light Editorial foundation screen in place of framework starter
  content; the full approved landing page remains Phase 5

## Secret conventions

1. Real values exist only in ignored local environment files or the deployment
   platform's secret store.
2. Only values intentionally safe for every browser may use a `NEXT_PUBLIC_`
   prefix. Bulletin currently defines none.
3. Service-role keys, signing secrets, SMTP credentials, Gemini keys, and cron
   secrets remain server-only.
4. Independent purposes use independent secrets. Management and session signing
   values must not be reused.
5. Logs accept operational identifiers, but not raw tokens, private URLs,
   subscriber email addresses, credentials, or article payloads containing PII.

## Verification result

- ESLint: passed
- TypeScript: passed
- Unit tests: 7 passed
- Production build: passed

`npm audit` reports one moderate PostCSS advisory through Next.js's bundled
dependency tree (shown as two related findings). The application uses the
current stable Next.js scaffold, and npm's suggested automatic fix is an unsafe
major downgrade to Next.js 9. The affected behavior is not used with
subscriber-supplied CSS. Re-check and upgrade when Next.js publishes a stable
dependency refresh; do not apply the downgrade.

## Phase 2 handoff

The next confirmed phase is Database. Before migrations are created, freeze the
exact tables, columns, enums, indexes, foreign keys, deletion behavior, RLS
policies, atomic claim functions, and retention jobs described by the master
project context. Database credentials should then become required only in the
server paths that use Supabase, so static builds and isolated tests remain safe.
