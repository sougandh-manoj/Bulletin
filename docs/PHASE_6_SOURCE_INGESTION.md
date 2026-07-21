# Bulletin Phase 6 — Source Catalogue and News Ingestion

> **Status:** Complete on 18 July 2026; two targeted catalogue expansions completed the same day  
> **Scope:** Reviewed source catalogue, safe RSS/Atom ingestion, deterministic article normalization, exact and bounded same-source duplicate handling, scheduling/health, and a protected server entry point  
> **Remote changes:** None. No production Supabase, Vercel, Cron, email, DNS, or deployment system was configured or mutated.

## 1. Outcome

Phase 6 adds the shared public-news ingestion foundation described in the master
context. It fetches each due active source once, stores normalized public article
metadata, and stops before any Phase 7 intelligence work.

The implementation preserves the completed Phase 1–5 boundaries:

- browser roles still cannot read or write source/article data;
- the Supabase service-role key and ingestion secret remain server-only;
- subscriber access, onboarding, landing-page behavior, and secure cookies are
  unchanged;
- production `__Host-` cookies and `secure: true` were not modified;
- no subscriber data is used by the shared ingestion pipeline;
- embeddings, clustering, Gemini, classification, summarization, localization,
  ranking, delivery, and admin operations are not invoked.

## 2. Catalogue result and governance

### Final counts

The catalogue contains 95 official feed endpoints from 24 publisher or
institutional identities.

| Measure | Count | Meaning |
| --- | ---: | --- |
| Reviewed endpoints | 95 | Every record has a stable key, original feed URL, publisher identity, role/scope, language/geography, usage notes, and final-check metadata |
| Technically verified | 92 | Returned structurally valid RSS/RDF at final verification |
| Technically blocked | 2 | OneIndia Malayalam endpoints returned Cloudflare `403` HTML instead of feeds |
| Technically broken | 1 | PIB's advertised English endpoint redirected across language and returned no English items |
| Active and scheduled | 48 | Usage-approved for the present narrow metadata/excerpt/link scope and technically verified |
| Disabled | 47 | Preserved for governance with an explicit terms or technical reason |

Usage-review state is deliberately fail-closed:

| Terms state | Count | Activation behavior |
| --- | ---: | --- |
| `approved` | 48 | Active only while technical state is `verified` |
| `restricted` | 27 | Disabled; The Indian Express RSS is personal/non-commercial, while its general terms conflict with systematic database storage |
| `rejected` | 16 | Disabled; current HT/Live Hindustan and Al Jazeera terms expressly prohibit relevant automated access/caching/scraping behavior |
| `pending` | 4 | Disabled pending technical recovery or a required permission step |

`approved` is an internal operational review state, not legal advice. Publisher
terms must be re-reviewed before an external, broad, or commercial launch. A
later activation or terms-state change should be a reviewed forward migration,
not an ad-hoc production edit.

### Publisher/feed composition

| Publisher or institution | Feeds | Language | Current catalogue role |
| --- | ---: | --- | --- |
| The Indian Express | 27 | English | National, topic, and city/state candidates; restricted/disabled |
| Live Hindustan | 12 | Hindi | National, topic, and eight state candidates; rejected/disabled |
| News18 Malayalam | 5 | Malayalam | Kerala, India, world, money, and sports; active |
| OneIndia Malayalam | 2 | Malayalam | Malayalam candidates; blocked/disabled |
| Onmanorama | 4 | English | Kerala, India, world, and business; active for the present personal/non-commercial scope |
| Press Information Bureau | 2 | English/Hindi | Official India statements; Hindi active, English broken/disabled |
| Reserve Bank of India | 3 | English | Press releases, notifications, and speeches; active institutional sources |
| Securities and Exchange Board of India | 1 | English | Regulatory updates; active institutional source |
| BBC News | 6 | English | World, Asia, business, technology, science/environment, and health; active with attribution requirements |
| Al Jazeera | 1 | English | Global candidate; rejected/disabled |
| United Nations News | 1 | English | Global institutional source; active |
| Deutsche Welle | 1 | English | Global RSS 1.0 candidate; permission step pending/disabled |
| Hindustan Times | 3 | English | India, world, and education candidates; rejected/disabled |
| NDTV.com | 12 | English/Hindi | National, latest, world, cities, South India, diaspora, business, and top-story supply; active for the present personal/non-commercial scope |
| India Today | 6 | English | Latest, national, state, economy, world, and sports supply; active for the present personal/non-commercial scope |
| Gadgets 360 | 1 | English | India-focused technology coverage; active for the present personal/non-commercial scope |
| Tech Xplore | 1 | English | Artificial intelligence and machine-learning research; active with attributed RSS syndication requirements |
| Phys.org | 1 | English | Science and technology research; active with attributed RSS syndication requirements |
| NASA | 1 | English | Official science news releases; active institutional source |
| Medical Xpress | 1 | English | Health and medical research; active with attributed RSS syndication requirements |
| World Health Organization | 1 | English | Official global health news; active institutional source for the present non-commercial scope |
| Mongabay India | 1 | English | India climate reporting; active under the recorded CC BY-ND conditions |
| Mongabay Hindi | 1 | Hindi | Hindi India climate reporting; active under the recorded CC BY-ND conditions |
| Carbon Brief | 1 | English | Climate science, policy, and energy; active for the present non-commercial scope |

Across all 95 records, the language mix is 69 English, 19 Hindi, and 7
Malayalam. The active mix is 36 English, 7 Hindi, and 5 Malayalam feeds.

The initial 68-feed catalogue met the master plan's starting target. After the
owner requested substantially more current data, a deliberately bounded
forward expansion added 12 NDTV and 6 India Today feeds. A second owner-approved
forward expansion added nine specialist feeds for technology/AI, science,
health, and climate. The active catalogue now has 3 technology/AI feeds, 3
science feeds, 3 health feeds, and 4 climate feeds. This raises active supply
without entering the deferred 100–150-feed expansion range. Further growth
remains gated on observed feed health, duplicate rates, processing time,
database growth, and Phase 7 language/AI cost.

State/UT candidates are recorded where reliable official section feeds were
found, including Delhi, Chandigarh, Jammu and Kashmir, Goa, Kerala, Karnataka,
Tamil Nadu, Telangana, Odisha, West Bengal, Uttar Pradesh, Rajasthan, Madhya
Pradesh, Bihar, Maharashtra, Gujarat, Himachal Pradesh, Jharkhand, Uttarakhand,
Haryana, Chhattisgarh, and a North East regional feed. Many remain disabled
because endpoint availability alone is not treated as usage permission. The
catalogue therefore does not claim equal active state supply.

### Verification method

Final verification used official publisher/institutional RSS pages and direct
HTTPS requests. Each candidate was checked for HTTP status, redirect target,
effective URL, content type, root format, and item count. The direct checks
confirmed important real-world parser cases:

- 200-item RSS feeds must be processed completely;
- Live Hindustan serves valid XML as `text/plain`;
- DW uses RSS 1.0/RDF rather than RSS 2.0;
- OneIndia returned HTML challenges;
- PIB's advertised English endpoint currently redirects incorrectly;
- publisher terms can be more restrictive than the presence of an RSS page;
- NDTV's selected feeds returned 20–100 entries in English and 100 entries in
  Hindi while remaining below the response-size limit;
- India Today's selected feeds returned 5–136 entries; an advertised but empty
  Top Stories feed was rejected from the expansion rather than counted;
- the nine specialist feeds returned 10–100 current entries apiece within the
  response-size limit;
- Tech Xplore, Phys.org, and Medical Xpress require an honest descriptive feed
  reader User-Agent; Bulletin already sends one and does not impersonate a
  browser;
- Google AI and MIT Technology Review remained pending candidates rather than
  being activated without a completed usage review;
- NDTV and India Today both publish personal/non-commercial RSS conditions, so
  their activation is limited to the current private MVP and must be re-reviewed
  before external or commercial use.

The full reviewed records, exact URLs, statuses, notes, and verification details
are in `20260718110000_phase_6_source_catalogue.sql` and the reviewed forward
expansions `20260718110300_phase_6_catalogue_expansion.sql` and
`20260718110400_phase_6_specialist_catalogue_expansion.sql`.

## 3. Database architecture

Phase 6 extends the existing Phase 2 `sources` and `articles` tables rather than
creating a parallel ingestion schema.

### Source metadata additions

The source catalogue now records:

- stable `catalogue_key`;
- publisher home and usage-review URLs;
- RSS 1.0/RSS 2.0/Atom format;
- exact redirect host allowlist;
- usage-review and technical-verification timestamps;
- technical status, HTTP status, verification notes, and disabled reason;
- latest HTTP result, response size, effective URL, parser version, and safe
  error code;
- Retry-After time and per-fetch article/duplicate counts.

Database constraints enforce HTTPS catalogue URLs, normalized allowlisted
hosts, valid technical states and counts, and the rule that an active catalogue
record must be technically verified. The existing rule that an active source
must be usage-approved remains in force.

### Article metadata additions

Articles now retain the original URL alongside the canonical URL, feed GUID/ID,
feed-updated time, timestamp/language/geography provenance, normalization
version, and optional same-source duplicate relation/kind.

Exact canonical URL duplicates are rejected by the existing unique SHA-256 URL
hash. Same-source title/near-title duplicates may be stored only as
`quarantined` rows linked to a same-source target inside strict time bounds.

### Atomic functions

- `claim_due_sources` remains the Phase 2 `FOR UPDATE SKIP LOCKED` claim
  primitive. A lease token prevents overlapping workers from owning the same
  source.
- `complete_source_ingestion` is the Phase 6 lease-bound completion primitive.
  It updates conditional headers, health, failures, next-fetch time,
  Retry-After, safe error metadata, counts, and lease release in one operation.
- `insert_ingested_article` provides a single-row guarded primitive used by
  database tests and narrow callers.
- `insert_ingested_articles` accepts the complete bounded feed result in one
  lease-bound RPC. It avoids a network round-trip per item, applies exact URL
  idempotency, and validates any duplicate relation in the database.

All functions are denied to `public`, `anon`, and `authenticated`; only
`service_role` can execute them. Existing RLS remains enabled and forced.

## 4. Ingestion flow

The worker runs the following sequence for a small claimed batch:

1. write a non-personal `rss-ingestion` heartbeat;
2. atomically claim due, active, usage-approved, technically verified sources;
3. process claimed sources sequentially so one source failure cannot cancel the
   next source;
4. fetch with safe transport and conditional headers;
5. on `304`, record a healthy success and schedule the normal interval without
   parsing;
6. parse every item in the bounded response;
7. normalize and visibly count invalid, stale, or future-dated entries;
8. compute stable hashes and deterministic duplicate decisions;
9. bulk-insert normalized article metadata under the source lease;
10. atomically record source success/health/next-fetch state and release the
    lease;
11. on failure, record a safe error code, exponential backoff/Retry-After, and
    release the lease when still owned;
12. complete the heartbeat with the non-personal batch size.

No global feed-item limit exists. Work is bounded by response bytes, execution
time, and small claimed-source batches instead.

## 5. Fetching and recovery controls

The feed client applies:

- credential-free HTTPS URLs only;
- exact per-source redirect-host allowlists;
- DNS resolution checks that reject private, loopback, link-local, multicast,
  documentation, and other non-public addresses;
- manual redirects with a default maximum of 3;
- an 8-second per-request timeout by default;
- a 2 MiB decompressed response limit by default, checked through both
  `Content-Length` and streamed bytes;
- XML/RSS/Atom content types, with XML signature sniffing for valid
  `text/plain` publisher feeds;
- `ETag`/`If-None-Match` and `Last-Modified`/`If-Modified-Since`;
- at most 3 total attempts with deterministic 250 ms and 1 second retry
  delays for transport, timeout, `408`, `425`, and `5xx` failures;
- no automatic retry for permanent `4xx` responses;
- parsed `Retry-After` dates/deltas for rate-limit scheduling rather than long
  function sleeps;
- failure backoff of 5 minutes, 15 minutes, 1 hour, then 6 hours;
- healthy recovery that resets consecutive failures and clears the safe last
  error after a `200` or `304` success.

Configuration is server-side through:

- `CRON_SHARED_SECRET`;
- `INGESTION_BATCH_SIZE` (default 4, maximum 10);
- `INGESTION_LEASE_SECONDS` (default 300, maximum 900);
- `INGESTION_TIMEOUT_MS` (default 8000, maximum 15000);
- `INGESTION_MAX_RESPONSE_BYTES` (default 2097152, maximum 5 MiB).

## 6. Defensive parsing and normalization

The only new runtime dependency is `fast-xml-parser` 5.10.0. A maintained XML
parser was necessary to support RSS 2.0, Atom, namespaces, CDATA, and RSS
1.0/RDF without a fragile regular-expression parser. Bulletin rejects all
`DOCTYPE` and `ENTITY` declarations before parsing, disables parser entity
processing, caps nesting, and decodes only basic XML/numeric entities in a
bounded input. The installed package introduced no npm audit finding.

Normalization is deterministic and versioned as `phase-6-v1`:

- Unicode NFKC normalization;
- control-character removal and Unicode whitespace collapse;
- stable punctuation and common breaking/live label normalization;
- exact publisher suffix normalization while preserving the original title;
- source-catalogue publisher, language, and geography as authoritative defaults;
- lowercase host, no fragment/credentials, default-port removal by the URL
  parser, stable query sorting, and removal of a closed tracking-parameter list;
- strict supported language aliases (`en`, `hi`, `ml`);
- source-derived ISO country/state/city provenance;
- RFC/ISO timestamp parsing with a 10-minute future tolerance and 30-day stale
  boundary; no timestamp is invented;
- stable SHA-256 canonical URL and normalized-title hashes;
- selected raw entry metadata retained under the existing 14-day policy.

### Duplicate policy

- Exact canonical URL: rejected and not stored.
- Exact normalized title: same source only, within 72 hours.
- Near title: same source only, within 6 hours, at least 6 Unicode word/number
  tokens, identical numeric-token sequence, and Dice bigram similarity at or
  above 0.92.
- In-feed same-source duplicates are counted and skipped deterministically;
  stored recent-source matches are inserted as quarantined audit rows.
- Cross-source similarity is not used in Phase 6. Multi-source event clustering
  belongs to Phase 7.

## 7. Protected entry point and logging

`POST /api/internal/ingestion` is Node-runtime, POST-only, private/no-store,
and protected by a timing-safe comparison of `Authorization: Bearer
<CRON_SHARED_SECRET>`. Unauthorized calls receive `401` and cannot claim work.

The route returns only batch counts. Logs contain safe catalogue keys, counts,
and bounded error codes/types. They do not include authorization values,
service-role credentials, subscriber data, feed bodies, article titles, or
private URL query strings.

No Vercel Cron or other remote scheduler was configured. Phase 10 must attach
an approved scheduler to this route and verify the hosting time limit before
launch.

## 8. Migrations and principal files

### Migrations

- `supabase/migrations/20260718110000_phase_6_source_catalogue.sql`
- `supabase/migrations/20260718110100_phase_6_ingestion_functions.sql`
- `supabase/migrations/20260718110200_phase_6_bulk_article_ingestion.sql`
- `supabase/migrations/20260718110300_phase_6_catalogue_expansion.sql`
- `supabase/migrations/20260718110400_phase_6_specialist_catalogue_expansion.sql`

### Server pipeline

- `apps/web/src/data/ingestion.ts`
- `apps/web/src/services/ingestion.ts`
- `apps/web/src/lib/ingestion/types.ts`
- `apps/web/src/lib/ingestion/fetch-feed.ts`
- `apps/web/src/lib/ingestion/parse-feed.ts`
- `apps/web/src/lib/ingestion/normalize.ts`
- `apps/web/src/lib/ingestion/dedupe.ts`
- `apps/web/src/app/api/internal/ingestion/route.ts`
- `apps/web/src/lib/security/internal.ts`

### Configuration and documentation

- `apps/web/src/env/schema.ts`
- `apps/web/src/env/server.ts`
- `apps/web/.env.example`
- `apps/web/next.config.ts`
- `apps/web/README.md`
- `apps/web/package.json`
- `package-lock.json`
- `docs/PHASE_6_SOURCE_INGESTION.md`
- `docs/BULLETIN_MASTER_PROJECT_CONTEXT.md`

### Tests and fixtures

- `supabase/tests/database/phase_6_source_ingestion.test.sql`
- `apps/web/src/lib/ingestion/fixtures/*`
- focused parser, normalizer, dedupe, fetch, service, and route tests beside the
  relevant modules;
- `apps/web/src/test/phase6-local-ingestion.test.ts` for an opt-in local-only
  end-to-end fixture.

## 9. Validation evidence

All completion gates passed on 18 July 2026:

- clean baseline before Phase 6: lint, TypeScript, 71 tests, and production
  build passed;
- clean baseline before the catalogue expansion: lint, TypeScript, 103 tests,
  and production build passed;
- final lint: passed;
- final TypeScript check: passed;
- final Vitest suite: 24 files passed, 103 tests passed; the opt-in local
  integration file was the only skipped file/test in the ordinary suite;
- production Next.js 16.2.10 build: passed; the build includes
  `/api/internal/ingestion`;
- clean local database replay: every Phase 2–6 migration, including both
  forward catalogue expansions, applied from scratch;
- post-replay catalogue query: 95 reviewed, 48 active, 92 technically verified,
  47 disabled, and 7 active Hindi feeds;
- full pgTAP suite: 126 assertions passed (61 Phase 2, 15 Phase 4, 50 Phase 6);
- application-schema lint (`public,bulletin_private`, fail on warning): no
  errors or warnings;
- deterministic local fixture ingestion after the clean replay: passed with one
  claimed source, three parsed entries, two visible timestamp rejections, one
  article insert, healthy source recovery, conditional metadata persistence,
  and lease release;
- final live catalogue-governance check: all 18 selected NDTV/India Today and
  all 9 selected specialist endpoints returned valid RSS 2.0 within the
  response-size limit; one empty India Today candidate was excluded;
- npm audit: no high or critical findings. Two moderate findings remain in the
  existing Next.js-bundled PostCSS dependency path; they were not introduced by
  the XML parser, and npm's suggested replacement is an invalid Next.js
  downgrade rather than an applicable safe fix.

The ordinary automated suite never depends on live publisher availability.
Live URLs are catalogue-governance evidence; parsing, transport, retry, rate
limit, timeout, redirect, oversized-body, malformed XML, duplicate, lease, and
isolation behavior use deterministic fixtures or injected responses.

## 10. Known limitations and remaining checks

- 48 of 95 reviewed endpoints are active because usage and technical states
  fail closed. The expansion materially improves Hindi general-news and broad
  national/state supply, but it does not provide equal dedicated coverage for
  every state/UT. Re-review or written permissions are needed before enabling
  many otherwise healthy endpoints.
- News18 Malayalam is approved for the present narrow metadata/excerpt/link
  scope based on its official RSS publication; it still requires a fresh terms
  review before external launch.
- Onmanorama, BBC, NDTV, and India Today activation is limited to the present
  personal, non-commercial scope with required attribution; re-review before
  external or commercial use.
- Gadgets 360, WHO, and Carbon Brief activation is likewise limited to the
  recorded private/non-commercial scope. NASA media attribution, Mongabay's
  no-derivatives condition, and the Science X attribution/link conditions must
  also be re-reviewed before launch.
- PIB's English feed and OneIndia's Malayalam feeds need technical recovery.
- DNS allowlisting plus pre-resolution substantially reduces SSRF risk, but a
  hosting-specific egress policy would add defense in depth and belongs to the
  Phase 10 infrastructure review.
- The parser decodes feed bytes as UTF-8. All activated feeds passed the final
  UTF-8 verification; a future non-UTF-8 source must remain disabled until a
  bounded charset policy is added and tested.
- The production scheduler, real-host duration, egress behavior, and alerting
  must be verified in Phase 10. No remote scheduler is present now.
- Safari localhost cookie behavior is intentionally unchanged and remains a
  Phase 10 HTTPS staging/production-like verification item.
- The final build emits the pre-existing Supabase Node-version deprecation
  warning from build workers. The repository requires Node 20.19 or newer and
  the validation shell used Node 24; the warning does not fail the build.

## 11. Phase 7 handoff

Phase 7 may consume only non-quarantined `articles` with
`processing_status = 'pending'` through the existing atomic article claim
functions. It should treat `source_id`, publisher attribution, language,
geography, timestamps, normalization version, and canonical hashes as the
Phase 6 provenance boundary.

Phase 7 must add, in its own sequential milestones:

- embeddings and candidate retrieval;
- deterministic multi-source event clustering;
- classification and sensitive-claim handling;
- Gemini integration, canonical summaries, localization, and output
  verification;
- quota/failure behavior for intelligence processing.

It must not weaken source activation/usage controls, rewrite original publisher
attribution, cluster quarantined duplicates as independent evidence, or fetch
feeds per subscriber.
