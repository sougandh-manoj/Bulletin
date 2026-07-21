# Bulletin web application

The Bulletin web surface is a Next.js App Router application written in strict
TypeScript and styled with Tailwind CSS. It lives inside the Bulletin npm
workspace. Phases 3–5 add onboarding, secure subscriber access, and the public
landing page. Phase 6 adds the server-only source catalogue and shared RSS/Atom
ingestion pipeline. Phase 7 adds shared article intelligence, event clustering,
verified canonical summaries, and lazy localization while preserving those
earlier boundaries.

## Local development

From the repository root:

```bash
npm install
cp apps/web/.env.example apps/web/.env.local
npm run dev
```

The local environment file is intentionally ignored. Never add real keys,
passwords, signatures, tokens, private links, or subscriber data to tracked
files.

## Quality checks

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

Run all four with `npm run check`.

## Foundation boundaries

- Product identity and confirmed option lists live in `src/config/product.ts`.
- Subscriber input is parsed through the shared Zod schema before persistence.
- Server environment variables are validated on first use.
- Secret-bearing modules use the `server-only` import guard.
- Structured logging sanitizes emails, sensitive keys, and private URL query
  parameters.
- Phase 1 does not connect a database, create subscriber records, send email,
  invoke Gemini, ingest feeds, or deploy the service.

## Onboarding boundary

- Unfinished choices are kept in the current tab with `sessionStorage` and are
  cleared after completion.
- Account checking, submission, resend, and check-inbox behavior are controlled
  Phase 3 previews. They do not send email or begin Phase 4 secure access.
- The final payload is validated with the shared subscriber Zod schema before
  the preview can complete.

## Phase 6 ingestion boundary

- The reviewed catalogue is stored by forward-only Supabase migrations. A feed
  is schedulable only when both its usage review and technical verification are
  approved.
- `POST /api/internal/ingestion` requires the server-only
  `CRON_SHARED_SECRET`; no browser role can claim sources or insert articles.
- Feed fetching is HTTPS-only, redirect-host allowlisted, DNS checked, timed
  out, response-size bounded, and conditional with `ETag`/`Last-Modified`.
- Parsing accepts RSS 2.0, Atom, and RSS 1.0/RDF, rejects DTD/entity
  declarations, and never truncates a valid bounded feed by item count.
- Normalization, hashing, exact duplicate rejection, and tightly bounded
  same-source near-duplicate handling are deterministic. Phase 7 intelligence
  work is not invoked here.
- Local end-to-end verification uses a deterministic fixture and refuses a
  non-local Supabase URL. See `docs/PHASE_6_SOURCE_INGESTION.md` for the command
  and catalogue governance details.

## Phase 7 shared-intelligence boundary

- `INTELLIGENCE_PROVIDER=disabled` is the safe default. Groq is the recommended
  summary provider and requires a server-only `GROQ_API_KEY`; ordinary
  automated tests use fake HTTP responses and never invoke a live provider.
- `POST /api/internal/intelligence` and
  `POST /api/internal/shared-summaries` require `CRON_SHARED_SECRET`; browser
  roles cannot execute their database primitives.
- Local rule-based candidate search is bounded. Event type, entities,
  geography, time, and numeric claims decide whether a merge is possible; no
  embedding model is used.
- Evidence independence is publisher-family and syndication aware. Exact
  publisher identity and source links remain attached to every summary.
- English is canonical. Hindi/Malayalam are queued lazily only after English is
  verified and a caller requests that language.
- Subscriber data is never sent to the provider and Phase 7 does not rank,
  schedule, render, or deliver a briefing.
- The optional real-local-database/fake-provider fixture refuses non-local
  Supabase URLs. Load local environment values, then run
  `npm run test:phase7:integration`.
- See `docs/PHASE_7_SHARED_STORY_INTELLIGENCE.md` for architecture, controls,
  validation, and Phase 8 handoff.
