# Bulletin Phase 7 — Shared Story Intelligence

> **Status:** Complete; rule-based clustering and Groq summary-provider support verified locally on 19 July 2026  
> **Scope:** Local article analysis, bounded rule-based event clustering, evidence policy, one-call canonical summaries, lazy Hindi/Malayalam localization, local grounding, provider controls, and protected worker entry points  
> **Remote changes:** Owner-approved provider tests used public-news evidence only. The Groq smoke test fetched NASA's approved public RSS feed and made one generation request per run; it did not use subscriber data or mutate a remote database. No production Supabase mutation, Cron, deployment, email, DNS, backup, or other production system was configured or changed.

## 1. Outcome

Phase 7 turns non-quarantined Phase 6 article metadata into reusable, verified
shared stories. It does not personalize stories for a subscriber and does not
schedule or send a briefing.

The implemented flow is:

1. atomically claim a bounded batch of pending or expired-lease articles;
2. locally classify the article into Bulletin's closed category list and extract
   canonical entities, geography, event time/type, action, outcome, important
   numbers, factual depth, uncertainty, and sensitive-claim flags;
3. stage the local intelligence under the active article lease;
4. retrieve at most a bounded recent candidate set ranked by explicit time,
   category, topic, event-type, and geography rules;
5. decide event identity locally from compatible facts and fail closed to a new
   cluster when identity remains ambiguous;
6. atomically link the article, calculate independent evidence, advance the
   cluster version only for a meaningful development, complete the article,
   and queue one canonical English summary when eligible;
7. make exactly one structured generation call for an eligible canonical
   English story, run deterministic local grounding, and store exact article
   citations and publisher attribution; invalid output fails closed without a
   repair or provider-verification call;
8. lazily queue and verify Hindi or Malayalam only after the English version is
   verified and a later caller requests that language.

No subscriber row, preference, identity, token, email address, delivery ID, or
private URL enters this pipeline.

## 2. Five-level clustering

Phase 7 completes the five levels defined in the master context.

### Level 1 — deterministic normalization

Phase 6 canonical URLs, hashes, normalized titles, and same-source duplicate
quarantine remain the first level. Phase 7's article claim explicitly excludes
rows with Phase 6 duplicate provenance even if their processing state drifts.

### Level 2 — local event signals

Deterministic code extracts the closed category, normalized topic tokens,
organizations where safely detectable, geography, publication/event time,
important numeric claims, and a stable event fingerprint. No model or external
provider is called. The forward migration removes the unused vector columns,
HNSW indexes, and `pgvector` extension.

### Level 3 — bounded recent candidates

`find_article_cluster_candidates` uses a bounded recent window, compatible
category groups, event type, topic overlap, and plausible country/state/city.
It returns at most 20 cluster snapshots and at most 12 accepted evidence
articles per candidate. It never compares one article with the full database.
The returned rule score only orders candidates; it cannot authorize a merge.

### Level 4 — event consistency

The deterministic check compares event type, country/state/city, event time,
principal people/organizations, and same-label numeric claims. Explicit factual
conflicts reject the candidate even when wording is very close.
A merge requires compatible facts plus a real event anchor. Ambiguous cases do
not trigger a language-model decision: they remain separate unless independent
cross-source wording proves an exact or near-syndicated match. Sensitive cases
still require independent reliable evidence before summary eligibility.

Meaningful updates require a new/changed outcome or important numeric claim;
paraphrased reporting alone does not advance a version. Cross-source exact or
near-syndicated wording never counts as an update.

### Level 5 — source preservation

Every accepted article remains linked through `story_cluster_articles` with the
decision method, safe reason metadata, and introduced cluster version. Articles
retain canonical URL, source, timestamp, language, geography, normalization,
and duplicate provenance. Summaries store article citation relations plus exact
publisher names and canonical URLs; generated prose never replaces evidence.

## 3. Local analysis and reviewed regression data

Deterministic server code produces the strict classification record. It covers:

- all 15 existing Bulletin categories;
- canonical topics and people/organization/location entities;
- ISO country plus state/region/city;
- event time and type;
- key action and outcome;
- labeled numeric claims, units, and qualifiers;
- opinion/sponsorship/invalid/insufficient status;
- factual depth, uncertainty markers, and closed sensitive-claim flags;
- only supplied source IDs.

The local rules deliberately use narrow sensitive-claim patterns so terms such
as “public beta” or basic cell research do not become false government/health
flags. Explicit opinion, sponsored, malformed, or very shallow records are
quarantined before any provider call. Unknown fields, malformed geography,
duplicate references and invented source IDs fail closed.

`reviewed-event-pairs.json` is the small manually reviewed deterministic
regression dataset. It covers clear matches, similar wording for different
events, difficult ambiguous pairs, meaningful updates, numeric conflicts,
Hindi/English and Malayalam/English cases, and a sensitive legal case. It
contains event facts and expected decisions, not private production similarity
thresholds. It is intentionally small; a larger held-out real-article set is a
launch-readiness requirement.

## 4. Evidence strength and publisher independence

Each source now has a reviewed `publisher_family_key`. Exact publisher identity
still drives attribution, while family identity prevents multiple feeds or
language editions of one publisher from masquerading as corroboration. The
initial mapping explicitly groups NDTV feeds, Mongabay India/Hindi editions,
and the Tech Xplore/Phys.org/Medical Xpress Science X family. Newly inserted unreviewed sources default to a
single fail-closed `unreviewed` family until reviewed.

Cross-source exact or near-identical syndication receives a shared evidence
independence key. An aggregator cannot qualify as reliable independent
corroboration. Institutional sources retain their role, but official statements
are not treated as automatically neutral truth.

The database calculates `weak`, `sufficient`, `strong`, or `conflicted` from
distinct evidence units and source properties. A sufficiently detailed direct,
reliable non-sensitive report may qualify alone so local/niche reporting is not
silenced. Sensitive political, financial, health, safety, government, conflict,
disaster, death, election, or legal claims remain open with one evidence unit
and require genuinely independent reliable corroboration before summary work.
Material conflicts move the cluster/summary out of eligible flow.

## 5. Provider boundary and data policy

All provider code is guarded by `server-only` and sits behind
`StorySummaryProvider`. Groq is the recommended runtime provider; Groq and the
optional Gemini adapter both use direct HTTPS rather than adding SDK
dependencies:

- generation: the selected provider is used only for canonical summarization
  or an explicitly queued localization, with a task-specific strict JSON
  schema;
- recommended provider/model: Groq with `openai/gpt-oss-20b`;
- Groq API key: bearer authorization header only, never URL/query/browser code;
- Groq output mode: strict JSON Schema with low reasoning effort and a bounded
  completion;
- timeout: abortable and operator-configurable;
- retries: at most the configured 1–3 HTTP attempts, default 1 for strict
  free-tier accounting, only for transport,
  timeout, `408`, `425`, `429`, or `5xx` failures;
- `Retry-After`: respected when present;
- permanent request/auth/schema/output failures: not blindly retried;
- batch circuit breaker: unavailable models/authentication stop immediately,
  while three repeated permanent malformed/request failures pause later calls
  for 15 minutes.

As of the implementation review, the relevant current official references are
Groq's [structured-output guide](https://console.groq.com/docs/structured-outputs),
[rate-limit guide](https://console.groq.com/docs/rate-limits), and
[model deprecation record](https://console.groq.com/docs/deprecations). Model
availability and limits remain operator-reviewed configuration. Only approved
public-news evidence is sent; no personal or security data is sent.

## 6. Shared summaries, localization, and verification

English is canonical. A verified output contains a factual headline, concise
summary, why-it-matters line, article IDs, exact publisher markers, uncertainty
markers, and update status. It is generated once per cluster version, not per
subscriber.

Before storage, deterministic grounding checks that:

- every cited ID belongs to accepted cluster evidence;
- every attribution marker matches that article's exact publisher;
- output numbers occur in cited evidence;
- long canonical claims have at least a lexical anchor in cited evidence;
- uncertainty is not silently removed;
- English canonical output is not actually Hindi/Malayalam text;
- localized output uses the target script;
- localization retains the canonical citation order and numeric facts.

Those checks become the stored verification record. There is no second AI
verification prompt and no AI repair prompt. A failed grounding check is a
visible excluded summary state. This guarantees one logical generation call
per eligible canonical story; weak or conflicting clusters use zero.

Hindi/Malayalam generation is deliberately lazy. The database refuses to queue
a localization before verified canonical English exists, and queueing is
idempotent per cluster version/language. Phase 8 may request a language after
selection; Phase 7 does not inspect subscriber preferences to decide demand.

## 7. Atomic work, quotas, and recovery

Article and summary claims use `FOR UPDATE SKIP LOCKED`, bounded batch sizes,
lease owner/token/expiry, attempt counters, and due times. Expired `claimed`
articles and expired `generating` summaries are reclaimable with a fresh token;
stale workers cannot stage, commit, or complete them. Article cluster commit
performs the evidence link, cluster state/version, article completion, and
English summary enqueue in one transaction.

Persistent quota windows live only in `bulletin_private`. They store counts and
estimated input units—not prompts, article text, responses, credentials, or
subscriber data. An advisory transaction lock serializes each provider/model
quota decision across workers. Minute/day request and unit ceilings are local
operator safety limits, not claims about a provider tier. Only summary and
explicit localization generation use these counters. Article processing,
candidate retrieval, clustering, evidence checks, and final grounding use no
provider quota. The local default for Flash-Lite generation remains below the
limit observed on the owner's free-tier dashboard.

Provider/data failures are isolated per article or summary. Transient failures
become future `retry-wait` work with bounded backoff; terminal malformed,
unsupported, insufficient, or conflicting outputs remain visibly excluded.
The next claimed item still runs.

## 8. Security and protected routes

Phase 7 creates no new public-schema table. Existing 20 public tables retain
forced RLS and exactly one service-role policy each. The private quota table is
outside the Data API and denied to browser roles. Every new RPC is denied to
`public`, `anon`, and `authenticated`, then granted only to `service_role`.

The Node-runtime routes are:

- `POST /api/internal/intelligence`;
- `POST /api/internal/shared-summaries`.

Both require a timing-safe comparison of `Authorization: Bearer
<CRON_SHARED_SECRET>`, return private/no-store aggregate counts only, and log
only IDs, safe error codes/types, and batch counts. Article bodies, prompts, raw
outputs, secrets, subscriber data, and private URLs are not logged or returned.

No scheduler was configured. Production invocation belongs to Phase 10.

## 9. Migrations and principal files

### Forward-only migrations

- `supabase/migrations/20260718170000_phase_7_summary_retry_state.sql`
- `supabase/migrations/20260718170100_phase_7_intelligence_schema.sql`
- `supabase/migrations/20260718170200_phase_7_intelligence_functions.sql`
- `supabase/migrations/20260719010000_phase_7_rule_based_clustering.sql`

### Server modules

- `apps/web/src/data/intelligence.ts`
- `apps/web/src/services/intelligence.ts`
- `apps/web/src/services/shared-summaries.ts`
- `apps/web/src/lib/intelligence/provider.ts`
- `apps/web/src/lib/intelligence/groq.ts`
- `apps/web/src/lib/intelligence/gemini.ts`
- `apps/web/src/lib/intelligence/factory.ts`
- `apps/web/src/lib/intelligence/schemas.ts`
- `apps/web/src/lib/intelligence/local-analysis.ts`
- `apps/web/src/lib/intelligence/deterministic.ts`
- `apps/web/src/lib/intelligence/grounding.ts`
- `apps/web/src/lib/intelligence/circuit-breaker.ts`
- `apps/web/src/lib/intelligence/prompts.ts`
- `apps/web/src/app/api/internal/intelligence/route.ts`
- `apps/web/src/app/api/internal/shared-summaries/route.ts`

### Tests and fixtures

- `supabase/tests/database/phase_7_shared_story_intelligence.test.sql`
- focused provider, schema, deterministic, grounding, service, and route tests
  beside the implementation;
- `apps/web/src/lib/intelligence/fixtures/reviewed-event-pairs.json`;
- `apps/web/src/test/phase7-local-intelligence.test.ts`, an opt-in local-only
  real-database flow with fake AI providers.

No runtime dependency was added.

## 10. Configuration

All new configuration is server-only and documented in
`apps/web/.env.example`:

- provider/model selection and key;
- article/summary batch and lease bounds;
- rule-based candidate count and lookback;
- provider timeout and attempts;
- summary/localization minute/day request and input-unit ceilings.

Model names, provider quotas, prices, and terms are unstable and must be
re-verified before enabling a production provider. The configured ceilings
must remain at or below the actual project tier.

## 11. Validation evidence

All Phase 7 completion gates, including the rule-based simplification, passed
on 19 July 2026:

- pre-change baseline: lint, TypeScript, 103 web tests, production build, clean
  database replay, 126 pgTAP assertions, and strict application-schema lint;
- final lint: passed;
- final TypeScript check: passed;
- ordinary Vitest suite after the Groq provider addition: 37 files passed and
  160 tests passed; five opt-in integration/live files were the expected skips;
- production Next.js 16.2.10 build: passed and includes both protected Phase 7
  routes;
- clean local database replay: all Phase 2–7 migrations and seed applied from
  scratch;
- full pgTAP suite: 193 assertions passed (61 Phase 2, 15 Phase 4, 50 Phase 6,
  67 Phase 7);
- strict `public,bulletin_private` database lint with fail-on-warning: no schema
  errors or warnings;
- deterministic local end-to-end flow against local Supabase with a fake
  provider: two differently worded independent articles clustered together,
  English verified with one generation task, then explicitly requested Hindi
  and Malayalam each verified with one localization task; no classification,
  embedding, cluster-verification, repair, or final-verification task was
  invoked;
- bounded live Groq smoke test: a recent approved NASA RSS article produced a
  schema-valid four-sentence canonical summary in one generation call and
  passed all local citation, attribution, numeric, uncertainty, and lexical
  grounding checks;
- Groq's first live compatibility response exposed unsupported provider-side
  string/array bound keywords. The adapter now removes only those bounds from
  Groq's strict schema while the unchanged Zod parser enforces them locally;
- client static asset scan: no provider endpoint/schema marker, service-role
  value, SMTP password, provider key name, or cron secret marker found;
- source invariants: 95 reviewed, 48 active, and 47 disabled remain unchanged;
- the redesign verification itself made no provider request and no remote
  mutation; the separately owner-approved earlier public-data compatibility run
  is documented as opt-in live testing.

The build emits the existing Supabase JavaScript warning that Node.js 20 and
below will lose support in a future release. The current repository engine
requirement still passes; upgrade the runtime to Node.js 22 before a dependency
upgrade makes that warning a hard requirement.

## 12. Known limitations and Phase 8 handoff

- Gemini and Groq endpoint/model/schema compatibility were exercised with the
  owner's explicit approval using public RSS data. Future live regression
  remains opt-in and bounded because it consumes project quota.
- The reviewed event-pair dataset is deliberately small and synthetic. Before
  launch, expand it with licensed/approved real feed examples and measure false
  merges/missed merges after any local-rule or summary-prompt change.
- RSS title/description metadata can be sparse. Phase 7 does not scrape article
  pages; low-factual-depth records fail closed.
- Local entity extraction is intentionally conservative, especially for Hindi
  and Malayalam. Ambiguous transliteration remains a separate cluster instead
  of spending a provider call or forcing a merge.
- Provider project quotas are operator configuration and must be rechecked when
  the model or account tier changes.
- Phase 8 may read only verified cluster versions/summaries, request lazy
  localization when selection needs it, and implement subscriber eligibility,
  preferences, exclusions, national→state→city priority, diversity, repeat
  suppression, and idempotent delivery scheduling. It must not bypass evidence
  verification or regenerate one summary per subscriber.
- Personalization, scheduling, email rendering/sending, admin operations,
  production Cron/deployment, backup, legal pages, and all Phase 8–10 work
  remain unimplemented.
