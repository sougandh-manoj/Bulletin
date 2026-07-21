# Bulletin — Master Project Context and Decision Record

> **Status:** Authoritative implementation context and decision record  
> **Last consolidated:** 19 July 2026  
> **Product:** Bulletin (working name)  
> **Owner:** Sougandh Manoj  
> **Current phase:** Phases 1–9 are complete; Phase 10 is in progress from 19 July 2026. Local launch-readiness work is implemented, but production provisioning, legal publication, production owner flow, and the 7–14 day soak remain incomplete.  
> **Primary instruction:** Do not begin building, coding, installing dependencies, creating databases, deploying services, or modifying the product unless the owner explicitly approves development.

---

## 0. How every future Codex task must use this file

This file is the durable source of truth for Bulletin. A future task working inside this project must read this file before proposing or making product changes.

### Decision precedence

If sources disagree, use this order:

1. The owner’s newest explicit instruction.
2. This master context file.
3. The two approved PDF blueprints in `output/pdf/`.
4. The original long planning handoff.
5. Early prototypes, old n8n workflows, sample copy, and placeholder designs.

Later confirmed corrections in this file deliberately override earlier planning. In particular:

- Geographic priority is **national first, then state, then city**.
- The original shared-summary architecture is retained; summarization is not initiated separately for each user.
- The initial catalogue target was roughly **50–70 verified feed endpoints**, not 100–150. Phase 6 met it with 68 reviewed feeds; on 18 July 2026 the owner then approved two bounded post-completion expansions to **95 reviewed / 48 active** feeds, first improving India-first and Hindi supply and then strengthening technology/AI, science, health, and climate coverage. Further expansion toward 100–150 remains gated on observed health, duplicates, processing time, storage, and Phase 7 cost/accuracy.
- Every Indian state and union territory receives equal product preference; Kerala is not specially favored.
- The MVP has no age or date-of-birth field and no parental-consent onboarding flow.
- On 19 July 2026 the owner explicitly deferred scheduled offsite backup for the small personal beta and accepted possible beta data loss. Existing backup code remains optional and dormant; revisit it only if the project grows.
- The original 15-stage implementation order is consolidated into 10 top-level
  phases. This is an organizational change only: no requirement, safety check,
  launch gate, or implementation dependency has been removed.

### Working style for future tasks

- Explain technical ideas in plain language.
- Keep ordinary replies concise, but be detailed when producing a plan, specification, review, or handoff.
- Do not repeat decisions already settled here.
- Ask only focused questions when an unresolved choice genuinely blocks progress.
- Make a recommendation when several reasonable options exist and explain the tradeoff briefly.
- Point out real reliability, security, accessibility, legal, cost, and scalability risks.
- Avoid unnecessary enterprise complexity; the initial audience is only 50–100 users.
- Preserve confirmed decisions unless the owner explicitly changes them.
- Verify unstable facts—prices, quotas, laws, platform limits, APIs, product terms, and current RSS URLs—against current official sources before relying on them.
- Never describe generated legal wording as professional legal advice.
- Never expose Bulletin’s private prompts, scoring weights, thresholds, source-quality scores, security secrets, or other “secret recipe” details in public copy or legal pages.

### Authorization boundary

This document is detailed enough to guide implementation, but it is **not implementation approval**. Planning, reviewing, research, and documentation are allowed. Product creation or modification begins only after a clear instruction such as “start development,” “build it,” or approval of a specific implementation phase.

---

## 1. Product identity and purpose

Bulletin is a personalized email news briefing service. It gives each subscriber a small, trustworthy, concise briefing at the exact schedule they select.

The subscriber chooses:

- Name and email
- Country
- State or region
- Optional city
- Briefing language
- News categories
- Optional custom topics
- Optional excluded topics
- Desired number of stories
- Delivery frequency
- Exact delivery time
- Timezone
- Email appearance

Bulletin then collects and processes public news once, identifies real-world events, verifies evidence, writes shared summaries, selects the most relevant stored stories for each subscriber, and delivers an editorial email.

### Central promise

> Stay informed without surrendering your time and attention.

### What Bulletin is not

Bulletin is not:

- An endless news feed
- A social network
- A breaking-news notification app
- A general-purpose news dashboard
- A user-facing briefing archive
- A behavioral advertising system
- A replacement for original publishers
- A chat experience in which the AI asks the subscriber questions

### Product principles

1. **Trust over volume.** Three supported stories are better than five padded stories.
2. **Shared intelligence, personal delivery.** Public news processing happens once; subscriber selection happens later.
3. **Calm over addictive.** There is no infinite feed, engagement trap, or click optimization.
4. **Transparency over black boxes.** Personalization comes from explicit preferences and understandable rules.
5. **Original sources remain visible.** Summaries never erase the underlying publishers.
6. **Failure must be visible.** The system must not silently lose work, overwrite preferences, or skip delivery.
7. **Free-tier discipline.** Cost controls may reduce throughput or story count, but never remove verification or permit unsafe output.

### Product name

“Bulletin” is the working name. During development, it must be centralized in configuration so it can be changed without searching the entire application.

---

## 2. MVP scope, audience, and constraints

### Initial operating target

- 50–100 users
- India-first private beta
- Personal, initially non-commercial project
- Preferably $0 infrastructure cost apart from a domain
- No credit card assumed
- Gmail is acceptable at initial volume
- Free tiers have no production service-level guarantee

### Geographic scope

- India receives national, state, and local coverage.
- Every Indian state and union territory is treated equally by product rules.
- Kerala receives no special preference, even though Malayalam is an initial supported language.
- Feed availability may produce different real-world depth across states; this limitation should be handled honestly rather than disguised.
- Outside India, the MVP provides global news. Deep country-specific regional/local coverage outside India is deferred.

### Audience and age position

Bulletin is intended to be understandable and useful across age groups, including a 16-year-old who wants to follow the world or their local area.

For the MVP:

- Do not add an age gate.
- Do not ask for date of birth.
- Do not change onboarding into a parental-consent flow.
- Do not use click tracking, behavioral monitoring, or targeted advertising.
- Keep privacy language plain and age-appropriate.
- Re-check current legal requirements immediately before launch and again before relevant phased Indian child-data obligations take effect.
- If law genuinely requires a new mechanism at launch time, propose the minimum compliant change and obtain owner approval before changing the product flow.

Historical legal planning note: official Indian DPDP enforcement materials reviewed during planning indicated that certain child-data and verifiable-parental-consent provisions were phased to take effect 18 months after 13 November 2025, approximately May 2027. This is not a permanent legal conclusion; current official law and commencement notices must be verified again before launch.

### Non-negotiable trust risks

The MVP must not:

- Corrupt or lose subscriber preferences
- Create duplicate subscriber accounts
- Overwrite an existing subscriber’s preferences during a new onboarding attempt
- Send duplicate scheduled briefings
- Send a briefing to the wrong recipient
- Silently miss scheduled deliveries
- Expose private management links or secrets
- Delete an account through an automatic email-scanner visit
- Lose the beta database; the owner explicitly accepts this risk while scheduled backup is deferred
- Publish unsupported, merged, invented, or misleading summaries

---

## 3. Public product surface

The planned public surface consists of:

- Landing page
- Five-step onboarding
- Check-email page
- Email-confirmation page
- Sample briefing and theme-selection experience
- Manage briefing page
- Unsubscribe and deletion confirmation page
- Privacy Policy
- Terms of Service

There is no normal password login, user news dashboard, briefing-history browser, social layer, or public admin link.

---

## 4. Visual identity and design system direction

### Overall personality

Bulletin should feel:

- Aesthetic
- Minimal
- Premium
- Calm
- Editorial
- Trustworthy
- High-converting without pressure
- Responsive on desktop, tablet, and mobile
- Intentionally designed, not like a generic SaaS template

### Primary direction: Light Editorial

Light Editorial is the dominant landing-page identity and default email theme. It should resemble a beautifully designed independent publication or contemporary journal adapted into a personal digital product, without imitating a specific newspaper.

Use:

- Warm ivory or soft off-white page backgrounds
- Soft cream elevated surfaces
- Deep charcoal primary text
- Muted graphite secondary text
- Muted editorial blue accents
- Fine warm-gray borders and dividers
- Strong editorial serif headlines
- Clean contemporary sans-serif interface and body text
- Bold, recognizable Bulletin masthead
- Noticeably bold story headlines
- Generous negative space
- Carefully controlled grids
- Deliberate asymmetry
- Restrained shadows
- Subtle paper-like warmth
- Small editorial labels
- Elegant source treatments

Starting palette, open to visual refinement:

| Role | Starting value |
|---|---:|
| Main background | `#F6F3EC` |
| Elevated surface | `#FCFAF5` |
| Main text | `#15191D` |
| Secondary text | `#5E6267` |
| Editorial blue | `#315F91` |
| Soft blue surface | `#E5EDF5` |
| Divider/border | `#D8D4CB` |
| Dark contrast surface | `#111820` |
| Warm text on dark | `#F4F1EA` |

Typography direction:

- Refined editorial serif similar in character to Instrument Serif, Newsreader, or DM Serif Display for major headlines and selected story titles
- Clean sans-serif similar in character to Inter, Manrope, or Geist for navigation, controls, labels, metadata, and body text
- Avoid overly thin weights
- Preserve excellent mobile readability

### Alternative theme: Signal Brief

Signal Brief is an alternate briefing appearance with a cleaner, analytical tone.

Use:

- Pale blue background
- Near-black text
- Restrained brighter-blue highlights
- Fine cool-grey dividers
- Focused, premium intelligence-report composition
- Strong readability

Avoid neon, hacker styling, purple gradients, futuristic HUD decoration, glowing borders, and cyberpunk imagery.

On the landing page it may appear selectively as a pale-blue layered preview card or theme preview. Light Editorial remains dominant.

### Alternative theme: Midnight Brief

Midnight Brief is a true dark editorial edition based on the approved visual
reference. It uses a near-black canvas, warm ivory serif headlines, muted grey
body copy, restrained blue signals, fine charcoal dividers, and a bordered
Why it matters panel. It should feel calm and highly legible rather than like a
dashboard or cyberpunk interface. Its dark appearance is intrinsic to the
edition and must remain intact in both light-mode and dark-mode email clients.

### Alternative theme: Amber Brief

Amber Brief is a warm ivory-and-gold intelligence edition based on the approved
visual reference. Its masthead uses the spaced BULLETIN wordmark alone, without
the decorative shield logo shown in the reference. Gold category markers,
hairline dividers, pale callout panels, verification details, and restrained
serif headlines create a luminous premium feel. Its light palette is intrinsic
to the edition and must remain intact in both light-mode and dark-mode clients.

### Things the design must avoid

- Generic blue-purple SaaS gradients
- Excessive glassmorphism
- Stock photography
- Cartoon illustrations
- Robots, brains, sparkle icons, or magic-wand AI imagery
- Loud neon and cyberpunk visuals
- Financial-trading-dashboard appearance
- Cluttered dashboards
- Excessive animation
- Scroll hijacking
- Fear-based information-overload imagery

### Motion

- Use restrained, smooth scroll reveals.
- Use CSS transitions for simple interactions.
- Use GSAP only where it provides clear visual value.
- Honor reduced-motion preferences.
- Motion must never delay comprehension or make onboarding feel slow.

### Landing-page CTA hierarchy

- Primary CTA: **Create my briefing**
- Secondary existing-user link: **Manage briefing**
- Manage briefing belongs subtly in header and footer.
- Do not place a prominent “Already an existing user?” block in the hero.
- The product and its benefit should be understandable within a few seconds.
- Exact delivery-time flexibility is a landing-page benefit worth communicating.

### Implemented landing-page baseline

The supplied standalone landing-page HTML was accepted as an excellent visual
baseline and implemented in Phase 5. The completed implementation and its
verification are recorded in `docs/PHASE_5_LANDING_PAGE.md`. Phase 5 included
these focused corrections:

- Fix the mobile navigation/drawer display behavior.
- Re-check contrast and accessibility.
- Reduce excessive mobile hero length if it slows the first action.
- Do not overclaim source coverage before the catalogue is verified.
- Keep animation restrained and practical.
- Replace placeholder links and controls with real behavior.

These refinements did not redesign the approved identity.

---

## 5. Complete subscriber journey

### New subscriber journey

1. Visitor opens the landing page.
2. Visitor clicks **Create my briefing**.
3. The website opens a smooth five-step onboarding form.
4. Step 1 collects name and email and performs an early email check.
5. The subscriber completes location, language, interests, and delivery choices.
6. The final step reviews all choices and receives explicit email consent.
7. The subscriber clicks **Generate my briefing**.
8. The website shows a calm check-email screen.
9. Bulletin sends a verification email.
10. The link opens the website theme-selection page with prepared sample previews of Light Editorial, Signal Brief, Midnight Brief, and Amber Brief.
11. Light Editorial is already selected by default.
12. The subscriber chooses a theme and presses **Start my Bulletin**; that deliberate action confirms the email, saves the first theme, and activates delivery together.
13. The website shows that the subscriber is active and when the first briefing is scheduled.
14. The subscriber can finish or open **Manage briefing**.

The confirmation preview uses carefully prepared sample content. It does not need to run the full live news pipeline immediately.

### Onboarding steps

#### Step 1 — About you

- Required name
- Required email
- Early existing-email check

#### Step 2 — Location and language

- Country
- State or region
- Optional city
- Briefing language
- Timezone, auto-detected and editable

#### Step 3 — Interests

- Categories
- Optional custom topics
- Optional excluded topics

#### Step 4 — Delivery

- Story count
- Frequency
- Weekly day when applicable
- Exact delivery time

#### Step 5 — Review

- Grouped readable summary of every choice
- **Edit** links that return to the relevant step
- Required consent checkbox
- Final CTA: **Generate my briefing**

### Progress behavior

- Keep it clean and minimal.
- Show a thin progress line and text such as **Step 2 of 5**.
- Completed steps can be revisited.
- Moving backward must preserve entered values.
- Do not make the progress indicator look like a long application process.

### Temporary draft protection

- Preserve the unfinished onboarding draft in the current browser tab.
- This protects against accidental refreshes or step navigation.
- It is not a permanent server-side account before submission.
- Clear it after successful completion or when the tab/session naturally ends.
- The phrase “preserve in the current browser tab” means temporary local browser storage for that onboarding attempt; it does not mean creating a subscriber record early.

### Field validation

- When a field contains an incorrect, invalid, or irrelevant value, show the message immediately below that field in red.
- Validate after a brief typing pause or when the user leaves the field; do not flash errors before they have had a reasonable chance to type.
- Error text must explain what to fix.
- Error meaning must not depend on red color alone; use accessible text and semantic error state.
- Clear the message as soon as the value becomes valid.
- Do not show a distant generic error if a specific field can be identified.
- Validate again on Next and on final submission.

### Mobile form behavior

- Use the appropriate keyboard for email and other field types.
- Keep the active input visible above the keyboard.
- Prevent the keyboard from covering validation text or the Next button.
- Make touch targets comfortable.
- Allow category pills and tags to wrap naturally.
- Searchable dropdowns must work without awkward full-page jumps.

### Consent checkbox

- Place it on the final review step.
- It is unchecked by default and required.
- Wording should clearly cover receiving Bulletin emails and the ability to unsubscribe at any time.
- The checkbox should look minimal, aesthetic, and consistent with Light Editorial.
- It must still be accessible with a visible focus state and a sufficiently large click/tap area.

---

## 6. Preference field rules

### Required fields

- Email
- Name
- Country
- State or region where applicable
- Briefing language
- At least one category
- Story count
- Frequency
- Delivery time
- Timezone
- Consent at final submission

### Optional fields

- City
- Custom topics
- Excluded topics

### Name

- Required.
- Use the subscriber’s current stored name in the email footer.
- Footer wording: **Exclusively prepared for {{user_name}}.**
- No example name may ever be hardcoded.

### Email

- Normalize safely for uniqueness and comparison.
- Email is unique in the database but is not the primary key.
- Typing an email never grants preference access.
- The subscriber cannot change the account email in the MVP.

### Country

- Searchable dropdown.
- India preselected.
- Country flag emoji may appear in the UI.

### State or region

- When India is selected, show a maintained Indian state/union-territory dropdown.
- For other countries, use a text field for state or region.
- Do not maintain global subdivision data for every country in the MVP.

### City

- Optional free-text input.
- Do not request precise device location permission.

### Timezone

- Auto-detect from the browser.
- Always show it as editable.
- Store a proper IANA timezone identifier, not merely a numeric UTC offset.

### Languages

Initial briefing languages:

- English
- Hindi
- Malayalam

Other languages are deferred until accuracy, source availability, and free-tier cost have been measured.

### Categories

Minimum 1; maximum 8.

Confirmed list:

1. India
2. World
3. Regional & Local
4. Politics
5. Business & Economy
6. Markets & Personal Finance
7. Startups
8. Technology & AI
9. Science
10. Health
11. Education & Careers
12. Government Schemes
13. Sports
14. Entertainment
15. Climate

Category UI:

- Rounded pills or cards in a loose, staggered editorial composition
- Click/tap once to select and again to deselect
- Use color, border, tone, or slight elevation for selected state
- Do not use checkmarks
- Keep movement minimal; a small hover lift is acceptable
- Display a counter such as **3 of 8**
- Wrap naturally on mobile

### Custom topics

- Optional.
- Maximum 5.
- Each custom topic is an independent positive preference.
- A strong custom-topic match can qualify a story even when its standard category is not selected.

### Excluded topics

- Optional.
- Maximum 5.
- Free text; no predefined common suggestions.
- Enter creates a removable tag.
- Example placeholder: **celebrity gossip**.
- Exclusion is semantic, not a naive word ban.
- Exclude a story when the topic is central to the story.
- Do not exclude it merely because the word or subject is mentioned incidentally.

### Story count

- 1–10 stories.
- Default: 3.
- There are no “quick,” “standard,” or “detailed” modes.
- All stories use the same concise structure.
- The count is a maximum desired count, not a promise to insert filler.

### Frequency

- Daily
- Weekdays
- Weekends
- Weekly

Weekly subscribers choose one preferred day.

### Delivery time

- Subscriber chooses an exact local time.
- Do not force predefined time slots.

### Theme

- Light Editorial: default
- Signal Brief: alternative
- Midnight Brief: true dark editorial alternative
- Amber Brief: warm ivory-and-gold intelligence alternative
- First selected on the website immediately after opening the verification link, not inside the email.
- **Start my Bulletin** deliberately confirms the subscription and saves that first theme together.
- Theme changes save immediately.
- Other preference edits use explicit **Save changes** behavior.

---

## 7. Existing subscribers and early email checks

The early email check exists to prevent someone from accidentally continuing through new-user onboarding when an account already exists.

After Step 1:

### Verified account exists

- Stop new-user onboarding.
- Do not create a duplicate.
- Do not overwrite existing preferences.
- Tell the visitor an existing Bulletin was found.
- Send a fresh secure management email to that address.
- Show a calm check-inbox state.

### Unverified pending account exists

- Preserve the stored pending preferences.
- Send a fresh verification email.
- Invalidate older verification links.
- Do not create another account.

If the person returns the next day and enters the same email, the still-valid pending record is found and a new confirmation email is sent. If the unverified record has expired after seven days, onboarding starts again cleanly.

### No account exists

- Continue normal onboarding.

### Landing-page Manage briefing flow

1. Visitor clicks **Manage briefing**.
2. Website asks for email.
3. If a verified account exists, send a secure management link.
4. If an unverified account exists, send a fresh verification link.
5. Show a calm check-inbox response without revealing private preferences.
6. If no account exists, show **New here? Create your Bulletin.**
7. Offer **Create my briefing**.
8. Open onboarding with the typed email prefilled.

The verification email confirms the account. It does not need to carry the permanent Manage briefing experience. The confirmation website session can offer Manage briefing, and every future briefing includes a secure Manage briefing link in its footer.

---

## 8. Verification, management access, and deletion security

### Subscriber identity

- `subscribers.id`: generated UUID primary key
- `subscribers.email`: unique
- Email is not a compound key and not an access credential.
- Database uniqueness must structurally block duplicate accounts.

### Email verification

- Verification link expires after 24 hours.
- Verification is one-time.
- A newly requested link invalidates earlier links.
- An email-link GET request only opens a confirmation page.
- A deliberate button sends the state-changing POST request.
- This protects against email security scanners that automatically open links.
- Successful verification activates delivery automatically.

### Signed management link

Each subscriber receives a private signed link representing:

- A public subscriber reference
- A token version
- A cryptographic HMAC signature

The signature is created with a server-only secret. A raw permanent private token does not need to be stored.

When opened:

1. Verify the signature using timing-safe comparison.
2. Verify the subscriber’s current `token_version`.
3. Create a short-lived session.
4. Set it in a `Secure`, `HttpOnly`, `SameSite` cookie.
5. Redirect to a clean URL that no longer displays the signature.

Links may appear in:

- Requested management-link emails
- Confirmation follow-up where appropriate
- Every briefing footer

### Token invalidation

- Increment one subscriber’s `token_version` to invalidate all older signed management links for that subscriber.
- Generate later links using the new version.
- This avoids rotating access for every subscriber when only one link is compromised.

### Known passwordless tradeoff

Anyone who obtains the real private management link may be able to access preferences. Risks include a compromised inbox, forwarded email, copied link, malware, and another compromised device. This is an accepted MVP tradeoff, reduced by HTTPS, signatures, versioning, clean redirects, short sessions, secure cookies, and rate limits.

### Required security controls

- HTTPS
- HMAC signatures
- Timing-safe comparison
- Secure, HttpOnly, SameSite cookies
- Short-lived sessions
- Rate limiting on email requests and token validation
- Strict input validation
- CSRF protection for state-changing browser actions where applicable
- Supabase Row Level Security
- Service-role key available only to trusted server functions
- Signing secrets and SMTP credentials only in server-side environment variables
- No sensitive token in frontend JavaScript
- No secrets committed to the repository
- Sanitized logs that do not record full private URLs or tokens
- Clean redirects after token verification
- Appropriate `Referrer-Policy` on private pages

### Manage briefing page

Contains only:

- Current preferences
- Delivery controls
- Theme selection
- Pause briefing
- Resume briefing
- Unsubscribe and delete

Does not contain:

- Past briefing history
- Analytics dashboard
- Social features
- Password controls
- Email-address changing

Use the wording **Manage briefing**, not “Update preferences.”

### Saving changes

- All ordinary preference changes require an explicit **Save changes** action.
- Validate the complete state.
- Snapshot the previous version.
- Commit the new version atomically in one transaction.
- If the transaction fails, keep the previous state intact.
- Retain preference history for 30 days for recovery and diagnosis.
- Theme is the sole preference that saves immediately.

### Pause and resume

- Pause immediately cancels or blocks any pending unsent briefing.
- Resume calculates the next normal scheduled delivery.
- Do not send a catch-up briefing merely because the subscriber resumed.

### Unsubscribe and deletion

- Never delete from a single GET request.
- Open an explicit confirmation page.
- Require a deliberate destructive confirmation.
- Immediately delete subscriber-related personal data after confirmation.
- Delete profile, preferences, preference history, schedule, access/session data, and relevant personal delivery data.
- Shared public article and story-cluster data may remain because it is not subscriber personal data.

---

## 9. Briefing content and email design

### Standard briefing composition

- Bulletin masthead
- Localized date
- Optional restrained greeting
- Actual number of delivered stories
- Story cards/sections
- Subscriber-specific footer
- Secure Manage briefing link

Every story contains:

1. Category label
2. Clean rewritten headline
3. Concise factual summary of 3–4 sentences
4. One-line **Why it matters**
5. Clickable original publisher sources
6. Optional **Update** label

Source attribution is presented as a compact publisher pill containing the real publisher icon and full publisher name. The direct original-article link appears immediately below its publisher pill. Publisher icons must come from normalized publisher metadata rather than being invented with CSS. When an icon is unavailable, omit it and make the publisher-name pill itself link directly to the original article.

Example structure:

```text
TECHNOLOGY & AI

A concise rewritten headline

A short factual summary explaining what happened, important context,
and the most relevant details supported by the source material.

Why it matters:
A clear explanation of why this development matters.

Sources: Reuters · The Hindu
```

Footer:

```text
Exclusively prepared for {{user_name}}.
Manage briefing
```

### Subject line

Default pattern:

> Your Bulletin - 12 July 2026

- Localize the date/pattern appropriately for the briefing language.
- Do not use clickbait headlines as the subject.
- This pattern may be revisited after real inbox testing.

### Source links and tracking

- Link directly to original publishers whenever possible.
- No click tracking in the MVP.
- No per-link tracking identifiers.
- No invisible behavioral tracking added merely for personalization.
- Delivery and operational status may still be recorded; that is not behavioral click profiling.

### Light Editorial email

- Pale ivory background
- Charcoal text
- Muted blue accent
- Large bold Bulletin masthead
- Bold story titles
- Fine editorial dividers
- Sources below every story
- Clear Why it matters treatment
- Email-safe layout

### Signal Brief email

- Pale blue background
- Near-black text
- Restrained blue highlights
- Fine cool-grey dividers
- Premium intelligence-report feel
- No cyberpunk styling
- Strong readability even when clients alter dark-mode colors

### Midnight Brief email

- Near-black outer canvas and card surface
- Warm ivory editorial serif headlines
- Spaced Bulletin masthead and quiet date/time treatment
- Muted grey body copy with restrained blue signal labels
- Outlined Why it matters panel with a slim blue rule
- Numbered follow-up stories and visible publisher names
- Email-safe table layout with fixed dark palette in device light and dark modes

### Amber Brief email

- Warm ivory canvas with a soft white editorial card
- Spaced BULLETIN wordmark with no decorative masthead logo
- Gold intelligence labels, category circles, and fine dividers
- Large refined serif headlines with graphite body copy
- Pale gold Why it matters panel with a slim amber rule
- Visible verification treatment and publisher names
- Email-safe table layout with fixed light palette in device light and dark modes

### Email implementation requirements

- Build new templates; do not reuse the old n8n/Gmail template.
- Use email-safe table layout and inline styles where required.
- Include a sensible plain-text version.
- Test Gmail desktop, Gmail mobile, Apple Mail, and Outlook where practical.
- Test both themes in client light and dark modes.
- Preserve accessibility, legible type sizes, meaningful link text, and sufficient contrast.

### Empty or reduced briefing

If fewer strong matches exist than requested, deliver fewer.

If none exist, send a short honest note such as:

> No meaningful updates matched your preferences during this briefing period.

Do not insert a “Something you may like” fallback in the MVP.

---

## 10. Source strategy and governance

### Catalogue size and expansion

- Begin with roughly 50–70 carefully verified feed endpoints.
- Do not activate hundreds of feeds merely to claim breadth.
- Expand toward 100–150 only after observing feed health, processing time, database growth, summary-provider quota, and language accuracy.
- Prioritize English and Hindi.
- Include Malayalam, but do not give Kerala higher ranking priority.
- Add other regional-language sources gradually after cost and accuracy tests.

This reduced starting scope is deliberate. Too many sources and languages could overwhelm Vercel’s free functions, create excessive clustering work, expand storage, and consume provider quota through eligible story summarization and explicitly requested localization. Article classification, candidate retrieval, clustering decisions, evidence checks, and grounding verification are local and do not consume generative quota.

### Coverage policy

- India-first national coverage is essential.
- State and local news should exist for every Indian state/UT where source supply permits.
- Outside India, global coverage is sufficient for the MVP.
- The system should not pretend equal source supply when publishers expose different feed quality.

### Source hierarchy

Prefer:

1. Official publisher RSS/Atom feed
2. Reliable direct publisher feed or section feed
3. Official institutional source for primary statements/data
4. Credible aggregator only for discovery or gap filling

Potential institutional sources include PIB, RBI, SEBI, ISRO, ministries, election/health agencies, and other relevant public bodies. These provide authoritative statements, not automatic neutral truth.

### Official-source rule

- Clearly label an institutional statement as official.
- For sensitive, disputed, or politically consequential claims, seek independent reporting as corroboration.
- Do not present an official claim as universally confirmed merely because it is official.

### Aggregator rule

- Prefer and display the original publisher.
- Obtain the direct publisher URL when safely possible.
- An aggregator does not count as an independent second source.
- An aggregator-only item cannot independently support a sensitive claim.
- Avoid heavy dependence on Google News query feeds.

### Excluded source material

- Opinion/editorial content as a substitute for factual reporting
- Sponsored posts and advertorials
- Disguised promotions
- Rumors, gossip, and unsupported sensational claims
- Repeatedly inaccurate or operationally broken feeds
- Legally unsuitable usage

### Source catalogue record

Each feed should record at least:

- Stable source UUID
- Publisher name
- Feed name
- Official feed URL
- Direct publisher domain
- Category/section scope
- Language
- Country
- State/region where applicable
- Expected update interval
- Reliability tier
- Primary or supplementary role
- Aggregator flag
- Institutional-source flag
- Terms/usage review status and notes
- Active/disabled state
- Last fetch time
- Next fetch time
- Last successful fetch
- Consecutive failures
- Health status
- `ETag`
- `Last-Modified`
- Parser notes
- Fallback source where appropriate

Current URLs and terms must be browsed and verified immediately before the catalogue is finalized. RSS endpoints are unstable.

---

## 11. Canonical backend architecture

### The central architectural decision

Bulletin has two distinct pipelines.

#### Shared public-news pipeline

```text
Fetch active feeds once
→ parse and normalize public article metadata
→ remove exact and near duplicates
→ find likely recent event candidates with bounded local rules
→ cluster reports about the same event
→ verify evidence and cluster consistency
→ generate one shared canonical summary per eligible cluster
→ verify the generated summary once with deterministic local checks
→ store the verified cluster and summary in Supabase
```

#### Per-subscriber delivery pipeline

```text
Find subscribers currently due
→ load preferences and delivery window
→ filter and rank stored verified story clusters
→ retrieve or lazily create the selected language version
→ apply diversity and repeat-suppression rules
→ render the chosen email theme
→ send through Gmail SMTP
→ record exactly what was delivered
```

### Architecture rule that must not change silently

All valid active-feed news is ingested, normalized, clustered, and—when eligible—summarized and stored before subscriber personalization. A proposed demand-driven design in which the system checks each user and only then begins summarizing was explicitly rejected as unnecessarily complex and liable to create delivery-time delays.

Therefore:

- Do not fetch RSS per user.
- Do not summarize the same event per user.
- Do not run final verification per user.
- Do not send subscriber PII to the summary provider.
- Per-user work should mostly be deterministic filtering, scoring, localization lookup, rendering, and sending.

### Why this fits the MVP

- Shared summary work is reused.
- Every subscriber receives the same factual canonical representation of an event.
- Delivery is fast because heavy news processing occurred earlier.
- 50–100 users remain plausible on free infrastructure.
- Future paid workers can replace free workers without changing product behavior.

---

## 12. RSS ingestion and article normalization

### Scheduling model

- Supabase Cron wakes a protected Vercel ingestion function about every 5 minutes.
- Each source has its own next-fetch time, normally around a 30-minute interval.
- Each wake-up claims only a small due batch.
- Requests should be staggered.
- One source failure must not block others.

### Fetch controls

- Conditional requests using `ETag` and `If-Modified-Since`/`Last-Modified`
- Network timeouts
- Retry with exponential or controlled backoff
- Respect `Retry-After`
- Redirect limits
- Maximum safe response size
- Defensive RSS and Atom parsing
- Per-source leases/atomic claims
- Clear health and failure status

### Ingested public metadata

- Original title
- RSS description/summary
- Publisher/source identity
- Feed identity
- Publication time
- Article URL
- Author if supplied
- Feed categories/tags
- Language and geography inferred or declared with provenance
- Other safe metadata directly supplied by the feed

Full article extraction/scraping is not part of the MVP. Later extraction may be considered only for publishers that permit it.

### No arbitrary content cap

The old prototype’s `Limit 100` behavior is rejected. Ingest every valid new item inside the technical window. Safety limits may prevent infinite pagination, oversized payloads, malformed content, duplicates, abuse, or oversized per-worker batches, but must not silently discard valid articles to satisfy an arbitrary global count.

### Deterministic normalization

Before expensive processing:

- Canonicalize URLs.
- Remove known tracking parameters.
- Normalize publisher identities and aliases.
- Normalize Unicode, punctuation, case where appropriate, and whitespace.
- Remove routine headline prefixes such as “Breaking:” for comparison while preserving the original title.
- Calculate stable canonical URL and normalized-title hashes.
- Reject exact duplicate entries.
- Collapse same-source near-identical duplicates carefully.
- Normalize and validate publication timestamps.
- Preserve raw input for audit/debugging within retention limits.

Normalization is Level 1 of clustering and also reduces cost everywhere downstream.

---

## 13. Five-level story clustering

Clustering is the core intelligence of Bulletin. Its purpose is to turn many articles about one real-world event into one canonical story without accidentally merging different events that merely look similar.

### Level 1 — Deterministic normalization

Remove obvious duplicates through:

- Canonical URLs
- Tracking-parameter removal
- Stable source IDs
- Normalized titles
- Punctuation/whitespace cleanup
- Common headline-prefix cleanup
- Exact hashes
- Carefully bounded near-duplicate comparison

This level is cheap and deterministic.

### Level 2 — Local event signals

Extract deterministic candidate signals from the title, RSS description, and
public feed metadata: normalized topic tokens, category, geography, event time,
organizations where safely detectable, important numbers, and a stable event
fingerprint. This level uses no trained model or external AI service.

### Level 3 — Recent candidate comparison

Never compare a new article with the entire database. Search a bounded recent candidate set using:

- Time proximity
- Category compatibility
- Geography
- Named people and organizations
- Key entities
- Normalized topic and wording overlap
- Event/update lineage where relevant

This improves performance and protects against merging recurring old events.

### Level 4 — Event consistency verification

Local candidate rules only propose a possible match. Consistency decides whether the new article joins the cluster.

Compare:

- Main people
- Organizations
- Location
- Event time
- Major numbers and quantities
- Topic/category
- Nature of the event
- Key action and outcome

Two elections, court hearings, market movements, disasters, or sports matches involving the same names must remain separate unless the event facts align.

The check is local and deterministic. Ambiguous candidates remain separate
unless independent cross-source wording proves an exact/near-syndicated match;
a candidate score alone never authorizes a merge.

### Level 5 — Source preservation

- Keep every accepted article linked to the cluster through a many-to-many relationship.
- Never let the canonical summary replace the evidence records.
- Preserve publisher names and direct URLs.
- Allow later re-verification and meaningful-update evaluation.
- Display the original sources to the subscriber.

### Cluster states

Recommended conceptual lifecycle:

- `candidate`: plausible neighboring reports exist
- `open`: accepting more consistent reports
- `verified`: sufficient consistent evidence; summary may be produced
- `conflicted`: reliable reports materially disagree
- `quarantined`: unsafe, malformed, or owner-blocked
- `updated`: meaningful later development attached through version/lineage

Exact state names may be refined in the final schema, but state must be explicit and resumable.

### Threshold calibration

Do not guess a similarity threshold and trust it. Before launch:

1. Build a manually reviewed dataset of real article pairs/groups.
2. Mark same-event pairs.
3. Mark pairs that must remain separate.
4. Include recurring events and deceptively similar headlines.
5. Include elections, court cases, sports, market movements, local news, and repeated organization names.
6. Measure false merges and missed merges.
7. Tune thresholds and candidate constraints.
8. Keep a regression dataset for later local-rule, threshold, or summary-prompt
   changes.

Similarity thresholds, entity tolerances, and exact internal tests are private implementation details and should not be disclosed publicly.

---

## 14. Evidence strength and story eligibility

### What “weak article/story” means

Weak does **not** mean local, niche, unpopular, or automatically single-source.

Weak means available evidence cannot safely support Bulletin’s promised output. Examples:

- A vague headline/description with too little factual information for a 3–4 sentence summary
- Missing or untrustworthy publication time
- No reliable original URL or publisher identity
- Opinion, gossip, sponsorship, or rumor presented as factual reporting
- A repeated story with no meaningful development
- A cluster whose reliable reports conflict too severely
- A sensitive claim with insufficient supporting evidence
- Metadata that appears malformed or internally inconsistent

### Single-source stories

Single-source stories may qualify for local, regional, or niche coverage where several outlets are unlikely. They should:

- Come from a sufficiently trustworthy direct source.
- Have enough factual metadata to summarize safely.
- Rank below an otherwise comparable strong multi-source cluster.
- Face stricter checks if the claim is sensitive.

### Sensitive claims

Examples:

- Deaths
- Public-safety claims
- Election outcomes
- Legal accusations
- Major financial claims
- Government actions
- Conflict
- Disasters
- Major health claims

These normally require at least two genuinely independent reliable sources, or an authoritative primary record plus independent reporting. An aggregator is not a second source.

### Conflicting reliable reports

- Attribute differences explicitly when that is safe and newsworthy.
- State that reports differ rather than silently choosing one.
- Preserve uncertainty.
- Exclude/quarantine the story when a reliable concise summary cannot be produced.

### Quality floor

- Never lower the evidence floor to meet a subscriber’s requested count.
- Never skip local final verification because provider quota is tight.
- Prefer a shorter or empty briefing.

---

## 15. The summary provider’s controlled role

The configured generative provider is a narrow summary writer, not an
autonomous newsroom and not a conversational agent in the delivery pipeline.

### Provider abstraction

- Place AI calls behind a provider interface.
- Allow later model/provider replacement.
- Version prompt, schema, model, and evaluation metadata.
- Do not scatter raw provider calls through product code.

### PII prohibition

Never send the summary provider:

- Subscriber name
- Subscriber email
- Management/verification link
- Token or signature
- Delivery identifier tied to a person
- Personal account information

The summary provider receives only the public cluster evidence needed to write
the shared summary or its explicitly requested localization.

### Local work before the summary provider

Classification, timestamp normalization, narrow sensitive-claim flags,
opinion/sponsorship rejection, candidate event-consistency decisions, citation
checks, number checks, uncertainty preservation, and final grounding all run in
deterministic server code. Ambiguity fails closed; it does not trigger another
language-model task.

### Generative tasks

#### 1. Summarization

Produces:

- Rewritten factual headline
- 3–4 sentence summary
- One-line Why it matters
- Source-ID references
- Uncertainty and attribution markers
- Update status where applicable

#### 2. Localization

Produces a Hindi or Malayalam version while preserving names, facts, numbers, uncertainty, attribution, and source references.

### Strict statuses

Every generative task returns only a structured result with one of these statuses:

- `success`
- `insufficient_evidence`
- `conflicting_evidence`
- `invalid_input`
- `failed`

The provider must never ask a follow-up question. A follow-up would block an automated worker, so it is treated as invalid output.

### Prompt constraints

- Strict JSON/schema output
- Reference only supplied source IDs
- No unsupported facts
- No invented quotes
- No invented numbers
- Preserve uncertainty
- Distinguish fact, attribution, and inference
- Avoid sensational/clickbait phrasing
- Fail rather than improvise
- Return prompt version and relevant model metadata

### Validation and retries

- Validate every output against the schema.
- Check source references exist.
- Make one generation attempt for an eligible canonical story.
- If schema or local grounding fails, mark the task failed and exclude the story
  without a provider repair or verification request.
- Do not create endless retry loops.
- Open a batch circuit immediately for an unavailable model/authentication, or
  after three repeated permanent malformed/request failures.
- Make failures visible to the owner.

### Final verification and free-tier budget

Final verification is valuable because schema-valid fluent text may still
introduce unsupported claims. It is retained as deterministic local grounding,
not as a second provider call.

To keep it inside free-tier limits:

- Ground once per shared summary locally, not per user.
- Maintain conservative internal request/token estimates.
- Stop starting new AI tasks before reaching the provider limit.
- Track summary/localization generation limits.
- Use already verified stories when quota is constrained.
- Deliver fewer or no stories rather than skipping verification.

Provider quotas, models, pricing, and data terms are unstable. Verify current official documentation before implementation and launch.

---

## 16. Shared summaries, languages, and update logic

### Canonical summary

Every eligible cluster receives one canonical English summary. Store:

- Canonical headline
- Summary
- Why it matters
- Category
- Source IDs
- Attribution/uncertainty markers
- Sensitive-story result
- Verification result
- Prompt version
- Model/provider metadata
- Creation/update timestamps
- Update/version lineage

### Lazy localization

- English is canonical.
- Create Hindi or Malayalam only when the first due subscriber needs that cluster in that language.
- Verify and store the language version.
- Reuse it for all later subscribers.
- Do not translate independently for each subscriber.

### Repeat suppression

- Record exactly which cluster version each subscriber received.
- Exclude already delivered versions from later briefings.
- A rewritten headline is not an update.
- A new publisher repeating the same facts is not an update.
- Only a meaningful factual development creates an update version.
- A legitimate returning story carries an **Update** label.

### Delivery windows

| Frequency | Relevant news window |
|---|---|
| Daily | Since the previous briefing, normally about 24 hours |
| Weekdays | Since previous weekday delivery; Monday includes the weekend gap |
| Weekends | Since the previous weekend delivery |
| Weekly | Since previous weekly delivery, up to roughly 7 days |

Within the window, rank the latest meaningful development rather than several near-identical articles.

---

## 17. Personalization intelligence

Personalization is deterministic, explainable, and based on explicit choices. It is not per-user AI summarization and not machine-learning click prediction.

### Selection sequence

1. Load verified clusters inside the subscriber’s relevant time window.
2. Remove cluster versions already delivered, unless a meaningful update exists.
3. Require a selected-category match or an independently qualifying custom-topic match.
4. Apply central-topic exclusions.
5. Apply language-version availability/generation rules.
6. Score eligible candidates.
7. Re-rank for category and subject diversity.
8. Select up to the requested count without filler.
9. Record selected cluster versions in the delivery.

### Hard boundaries

- A nationally important story outside all selected categories must not be inserted merely because it is important.
- A custom topic can independently qualify a story.
- A central excluded topic is a hard block.
- Incidental mention of an excluded topic is not a block.
- Already delivered content is blocked unless it is a meaningful update.
- Unverified, conflicted, quarantined, or unsupported content is never eligible.

### Geographic priority

Correct confirmed order:

1. National/India-wide importance
2. State relevance
3. City relevance

Local relevance personalizes the briefing, but weak local content must not displace stronger national content merely to satisfy location. Within otherwise comparable quality, subscriber-specific state and city matches provide useful positive signals.

### Conceptual positive signals

- Direct custom-topic match: strong positive signal
- Selected category match: eligibility and positive relevance
- National importance: highest geographic tier
- State relevance: next geographic tier
- City relevance: third geographic tier
- Recency: newer meaningful developments rank higher
- Meaningful update: may re-enter despite earlier delivery
- Multi-source support: positive evidence signal
- Authoritative primary record plus independent reporting: strong signal
- Source quality/reliability: positive but must not automatically erase niche sources
- Sufficient factual depth: positive eligibility/quality signal

Exact numerical weights and thresholds are not publicly disclosed and must be tested before being locked in code.

### Diversity rule

- For 3–4 selected stories, normally no more than 2 come from one category.
- For 5–10 selected stories, normally no more than 40% come from one category.
- Relax the cap when the subscriber selected only one category.
- Relax it when no strong alternatives exist.
- Suppress several stories about essentially the same subject even if classification placed them in different categories.
- Diversity must never force weak content into the email.

### No behavioral tracking

- Do not track source-link clicks in the MVP.
- Do not create hidden interest profiles.
- Do not call the current design machine-learning personalization.
- It is rule-based personalization using explicit categories, topics, exclusions, location, time, quality, and evidence.
- Behavioral/ML personalization could be considered much later at large scale, but only through a separate privacy and product decision.

---

## 18. Scheduling, idempotency, and workers

### Time model

- Store the subscriber’s local time and IANA timezone.
- Store `next_delivery_at` in UTC.
- Correctly calculate daily, weekday, weekend, and weekly future times.
- Test daylight-saving transitions even though India itself does not observe DST, because non-Indian timezones can.

### Due-delivery transaction

1. Find confirmed active subscribers whose UTC time is due.
2. Atomically claim/lock the schedule slot.
3. Insert a delivery record.
4. Calculate and persist the next delivery time in the same transaction.
5. Leave a resumable pending delivery job.

### Idempotency

Use a unique key conceptually equivalent to:

```text
subscriber UUID + scheduled UTC delivery time
```

A database unique constraint must prevent two deliveries for one schedule slot, even if cron overlaps, workers restart, responses time out, or retries occur.

### Worker groups

#### RSS ingestion worker

- Trigger about every 5 minutes.
- Claim a small batch of due sources.
- Fetch and parse feeds.
- Normalize and insert articles.
- Update source health and next fetch time.
- Isolate source failures.

#### Article-processing worker

- Trigger about every minute.
- Claim unprocessed articles.
- Find recent candidate clusters with bounded local rules.
- Verify consistency.
- Create/update clusters.
- Generate and verify shared summaries as eligible and within quota.
- Persist explicit state.

#### Briefing scheduler

- Trigger every minute.
- Find due subscribers.
- Create idempotent delivery jobs.
- Advance schedules.

#### Email-delivery worker

- Trigger every minute.
- Claim pending deliveries.
- Rank stored eligible clusters.
- Generate missing stored language versions if quota permits.
- Render the chosen theme.
- Send through Gmail.
- Record success or failure.

#### Cleanup worker

- Run daily.
- Delete expired unverified records.
- Apply technical-data retention.
- Clean expired sessions/tokens/jobs as defined by schema.

### Worker mechanics

- Vercel functions remain stateless.
- Persistent state belongs in Supabase.
- Use small resumable batches.
- Use leases with expirations.
- Use atomic claims and transactions.
- Make retries bounded and safe.
- Make every important state explicit.
- Redis is not required in the MVP.

### Delivery timing target

- Normal goal: begin sending within 1–2 minutes of chosen time.
- Launch acceptance: start within 5 minutes.
- Exact inbox arrival cannot be guaranteed because receiving providers control final delivery.

---

## 19. Email transport

### Sender

Use one dedicated Gmail account for:

- Verification emails
- Management-link emails
- Briefing emails

### Configuration

- Enable Gmail two-factor authentication.
- Use a Gmail App Password.
- Use Nodemailer over SMTP 465 or 587.
- Store credentials as server-side environment secrets.
- Never store or use the normal Gmail password.
- Consider OAuth 2 or a transactional provider only when scale/reliability requires it.

### Retry behavior

Temporary failures retry approximately after:

- 5 minutes
- 15 minutes
- 60 minutes

Permanent failures must not retry indefinitely. Completed successful deliveries must never be retried or manually resent through a casual admin action.

### Gmail limitations

A personal Gmail sender has daily quotas and no delivery SLA. 50–100 daily recipients may be technically plausible, but this must be confirmed against current Gmail rules and tested. If quota/reputation/reliability becomes inadequate, migrate transport without changing the higher-level delivery model.

---

## 20. Technology and hosting

### Confirmed stack

- Next.js
- TypeScript
- Tailwind CSS
- GSAP only for selected landing motion
- Node.js/TypeScript worker logic
- Supabase PostgreSQL
- Supabase Cron
- Protected Vercel Functions
- A summary-only generation provider behind a replaceable abstraction
- Nodemailer
- Gmail SMTP
- Shared TypeScript types
- Shared validation schemas, likely Zod
- One monorepo

### Free hosting model

```text
Supabase Cron
→ authenticated HTTP call
→ protected ordinary Vercel Function
→ small resumable batch
→ persistent state in Supabase
```

Do not use Vercel Hobby Cron for minute-level scheduling; its free scheduling behavior is too limited/imprecise for this requirement.

### Rejected initial hosting options

- Railway paid worker: rejected because of recurring cost.
- Google Cloud Run: rejected for initial zero-card/free deployment because active billing is commonly required.
- n8n: prototype/reference only; removed from production runtime.

Free-tier availability, acceptable-use rules, quotas, and pricing must be verified immediately before implementation/deployment.

---

## 21. Database model

Supabase PostgreSQL is the source of truth.

### Core tables

#### `subscribers`

Conceptual fields:

- UUID primary key
- Unique normalized email
- Required name
- Verification status/timestamps
- Active/paused status
- Token version
- Country
- State/region
- City
- Language
- Categories
- Custom topics
- Excluded topics
- Story count
- Frequency
- Weekly day where applicable
- Local delivery time
- IANA timezone
- `next_delivery_at`
- Theme
- Consent timestamp/version
- Created and updated timestamps

#### `preference_versions`

- Subscriber reference
- Previous validated preference snapshot
- Version/reason
- Created time
- Retained for 30 days

#### `sources`

- Source configuration, provenance, scope, schedule, reliability, terms-review status, and health

#### `articles`

- Normalized RSS article records
- Original/raw metadata within retention
- Canonical hashes
- Processing state
- Classification/entities
- Deterministic event signals and fingerprint

#### `story_clusters`

- Canonical event identity
- Category/geography/entities
- Evidence and sensitive-state flags
- Lifecycle status
- Update lineage/version
- Representative event facts and local candidate signals

#### `story_cluster_articles`

- Many-to-many evidence relation
- Join decision/provenance where useful

#### `cluster_summaries`

- Cluster/version/language uniqueness
- Headline, summary, Why it matters
- Source references
- Prompt/schema/model/provider versions
- Verification status and result

#### `deliveries`

- Subscriber reference
- Scheduled UTC slot
- Unique idempotency key
- State and attempts
- Send timestamps
- Failure classification
- Actual story count
- Theme/language snapshot as required

#### `delivery_stories`

- Exact cluster version and summary language included in a delivery
- Ordering
- Supports repeat suppression and auditability

#### `admin_audit_log`

- Owner action
- Target
- Timestamp
- Before/after or safe action metadata
- Outcome/failure

Additional technical tables may include verification tokens, sessions, admin sessions, job leases, and alert events. Final columns, indexes, constraints, RLS, database functions, and cascade rules must be explicitly designed before migrations are built.

### Retention

| Data | Initial retention |
|---|---|
| Raw RSS metadata | 14 days |
| Story clusters and summaries | 30 days |
| Delivery records | 90 days |
| Preference versions | 30 days |
| Unverified signups | 7 days |
| Confirmed subscriber data | Until confirmed deletion/unsubscribe |

Retention may be tuned after measuring storage and recovery needs, but personal deletion promises must remain accurate.

### Database safeguards

- Unique email constraint
- Unique delivery idempotency constraint
- Foreign keys
- Appropriate cascading/deferred deletion rules
- Transactions for preference save and delivery creation
- Atomic claim functions
- Indexes for due jobs, bounded rule-based cluster search, source scheduling, and subscriber lookup
- RLS preventing broad client access
- Service-role use restricted to trusted server paths

---

## 22. Owner-only admin operations

### Visibility and access

- Never show Admin in public navigation/footer.
- Exclude admin routes from sitemap and indexing.
- A possible route is `/internal/access`, but the exact path is not a security control.
- Use an allowlisted owner email.
- Send a short-lived one-time login link.
- Create a secure expiring admin session.
- Protect all controls server-side.

### Dashboard information

- Subscriber count
- Active/paused/unverified counts
- Source health and last successful ingestion
- Failed/disabled feeds
- Article-processing backlog and status
- Cluster conflicts/quarantines
- Summary/verification failures
- Scheduled/pending/failed deliveries
- Email success and failure
- Worker health/stalls
- Summary-provider request/token estimates and quota guard
- Gmail quota/reputation warning indicators where available

### Safe owner controls

- Enable, disable, test, and manually fetch a source
- Quarantine a cluster so it cannot be delivered
- Reprocess an appropriate failed cluster
- Regenerate a failed summary within quota safeguards
- Global email delivery kill switch
- Global summary-provider processing pause/resume
- Search subscriber status, schedule, and delivery results
- Resend verification or management access email
- Pause/resume a subscriber
- Invalidate one subscriber’s old management links
- Cancel pending unsent delivery
- Delete a subscriber only with strong confirmation
- Inspect audit log

### Boundaries on “full control”

The owner should have strong operational control, but the interface must not make trust violations easy.

Admin must not:

- Silently edit subscriber preferences
- Impersonate a subscriber without an explicit separately designed audited mechanism
- Resend a successful briefing
- Retry completed jobs
- Retry permanent failures forever
- Bypass delivery idempotency
- Bypass evidence verification

### Alerts

Urgent owner email for high-severity conditions such as:

- Widespread delivery failure
- Worker stall
- Approaching/exhausted summary-provider safety ceiling
- Widespread source outage
- Security-sensitive anomaly as defined later

Minor isolated warnings stay in the dashboard to prevent alert fatigue.

### Retry policy

Safe automated retry applies to temporary:

- RSS/network failures
- Processing failures known to be transient
- Summary-provider transport/rate-limit failures inside quota rules
- SMTP temporary failures

Never retry completed work or permanent failures indiscriminately.

---

## 23. Backup and disaster recovery

Scheduled offsite backup is deferred for the small personal beta by explicit owner decision on 19 July 2026. Do not create a backup runner, Drive OAuth setup, retention schedule, or restore launch gate. The owner accepts that a Supabase/project failure may lose beta data and require participants to register again.

The already implemented local/fake/Google Drive backup code and local restore drill remain dormant reference work. Reconsider backup only if the owner chooses to grow the project or begins treating beta data as operationally valuable.

---

## 24. Privacy, Terms, and public disclosure boundaries

Create real product-specific Privacy Policy and Terms of Service pages before external launch. They must not be placeholders.

### Privacy Policy should clearly cover

- Data collected
- Why each item is collected
- Email consent
- Delivery and management purpose
- Retention periods
- Unsubscribe/deletion behavior
- Subscriber rights and contact route
- Security limitations
- Cross-border/service-provider processing as applicable
- Processors/services such as Supabase, Vercel, Google/Gmail, and the configured summary provider
- No click tracking or targeted advertising in the MVP
- Age-appropriate plain language
- Source-link behavior

### Terms should clearly cover

- What Bulletin provides
- Service limitations and possible interruption
- No guarantee of complete news coverage
- No guarantee of exact inbox arrival
- Summary/information limitations
- Reliance on third-party publishers and feeds
- Attribution and ownership of original reporting
- Prohibited abuse
- Account/access-link responsibility
- Suspension/termination/deletion basics
- Changes to service/terms
- Contact information

### Secret-recipe boundary

Public legal pages must describe processing honestly but must not publish:

- Prompt text
- Scoring weights
- Clustering thresholds
- Source-quality scores
- Exact internal ranking rules
- Quota reserve formulas
- Security secrets or signing design details that increase attack risk
- Proprietary operational heuristics

It is sufficient to say the service collects public news metadata, groups related reports, uses automated processing/AI to classify and summarize, checks outputs, applies subscriber preferences, and delivers email. Transparency does not require revealing every internal algorithm.

### Legal verification

- Verify current official requirements immediately before final wording and launch.
- Obtain professional legal review before broad public/commercial launch if feasible.
- Do not represent Codex-generated terms as legal advice.

---

## 25. Reliability, failure behavior, and launch gates

### Fail-closed principle

When evidence, AI output, quota, database state, or delivery state is uncertain, choose a visible failure, delay, shorter briefing, or no-story briefing. Never invent, silently overwrite, or risk duplicates to make the system appear successful.

### Example failure behavior

| Failure | System behavior |
|---|---|
| RSS timeout | Back off, isolate source, continue other feeds |
| Malformed feed | Mark parser failure, alert after threshold |
| Worker crash | Lease expires and another worker safely resumes |
| Duplicate cron call | Unique idempotency constraint blocks duplicate delivery |
| Summary provider returns malformed JSON | Fail/exclude visibly; do not spend a repair request |
| Summary provider reports insufficient evidence | Do not summarize/deliver that cluster |
| Summary-provider quota safety ceiling | Stop new AI work; use verified inventory or fewer stories |
| Conflicting cluster | Attribute safely or quarantine/exclude |
| SMTP temporary failure | Retry at approximately 5, 15, and 60 minutes |
| SMTP permanent failure | Stop retries; expose status to owner |
| Preference-save conflict | Roll back transaction and retain old state |

### Required test program

- Owner-controlled end-to-end accounts
- Simulate 100 subscribers due together
- Thousands of preference updates
- Duplicate scheduler calls
- Overlapping workers
- Forced crashes at major state transitions
- Gmail temporary and permanent failure simulations
- Malformed provider JSON
- Unsupported generated facts
- Summary-provider quota exhaustion
- RSS timeout
- Invalid XML/Atom
- Oversized payload
- Broken/disabled feed
- All four delivery frequencies
- Multiple timezones
- Daylight-saving transitions
- Link expiration and invalidation
- Email-scanner-safe verification and deletion flows
- No duplicate accounts
- No preference overwrite on existing email
- All email themes across target clients
- 7–14 day soak test

### Launch gate

- Zero corrupted or lost preferences
- Zero duplicate scheduled deliveries
- Every important processing failure visible to owner
- At least 99% of test sends begin within 5 minutes of selected time
- 7–14 day soak test completed
- Summary-provider and Gmail usage safely within current verified limits
- Publisher RSS/feed terms re-reviewed immediately before any external, broad,
  or commercial launch; conditionally approved sources remain disabled unless
  the current launch use is confirmed compatible
- Privacy/Terms published and current legal position checked

### Rollout order

1. Owner test accounts
2. Five trusted users
3. Twenty users
4. Fifty to one hundred private-beta users

If free architecture cannot meet the launch gate, do not launch publicly. Move the same worker logic to a more reliable paid environment later when possible.

---

## 26. Cost controls

Expected initial position, subject to current official verification:

- Vercel Hobby: $0 for an eligible personal/non-commercial beta
- Supabase Free: $0
- Summary provider: chosen within the owner-approved budget and verified quota
- Gmail: $0 within account limits
- Domain: expected paid annual cost

### Cost-control rules

- Small source catalogue first
- Conditional feed requests
- Normalize, cluster, and verify evidence before the summary provider
- Bounded candidate search
- Shared summary generation
- Deterministic local final verification once per shared summary
- Lazy stored localization
- No per-user summarization
- No subscriber PII sent to the summary provider
- Conservative quota tracking
- Summary/localization generation quota ceilings only
- Reduce processing rather than remove safety checks

Internal cost/quota information appears only in the private admin dashboard, never to subscribers.

---

## 27. Rejected, replaced, and deferred ideas

Do not reintroduce these without discussing them with the owner.

### Rejected/replaced

- n8n as production runtime
- Old n8n Gemini mega-prompt
- Old Gmail/n8n email styling
- Per-user RSS fetching
- Per-user summarization
- Demand-driven summarization beginning only after checking due-user preferences
- Full article scraping in MVP
- User-selected publishers
- Exact-title-only deduplication
- Fixed arbitrary `Limit 100`
- Vercel Hobby Cron for minute scheduling
- Railway paid worker for initial MVP
- Google Cloud Run with required billing for initial deployment
- Redis for MVP coordination
- Password-based normal user accounts
- Preference access from typed email alone
- Duplicate account creation
- Overwriting existing preferences during onboarding
- User email-address changing
- Immediate verification/deletion on email-link GET
- Public Admin link
- User briefing-history dashboard
- Social features
- Predefined delivery time slots
- Quick/standard/detailed modes
- Predefined excluded-topic suggestions
- Checkmarks on category pills
- Filler stories
- “Something you may like” fallback
- Automatic insertion of nationally important stories outside chosen categories
- Kerala-first source/ranking preference
- City-first geographic ranking
- Click tracking for MVP
- Hidden ML behavioral personalization
- Age/DOB field and parental-consent onboarding in MVP
- Skipping local final verification to save provider quota
- Allowing provider follow-up questions
- Retrying successful deliveries
- Silently editing subscriber preferences from Admin

### Deferred

- Wider regional-language coverage after cost/accuracy testing
- Deep non-India local coverage
- Full permitted article extraction
- User-facing history
- Email-address changes
- OAuth 2/transactional email provider migration
- Behavioral or ML personalization
- Click analytics
- Large source catalogue expansion
- Paid always-on worker hosting
- More sophisticated age/guardian mechanisms if future law requires them
- Extra fallback recommendations

---

## 28. Ten-phase implementation dependency order

On 17 July 2026, the owner approved consolidating the original 15-stage roadmap
into 10 top-level phases. The consolidation reduces roadmap and handoff
overhead; it does not reduce the product scope or testing obligations described
throughout this file.

Build in this order unless a later explicit owner decision changes it:

1. **Foundation — complete** — Next.js, TypeScript, centralized product configuration, validation, logging, and secrets conventions
2. **Database — complete** — migrations, constraints, RLS, atomic claims, retention foundations, and the later removal of unused vector infrastructure
3. **Onboarding — complete** — five steps, draft protection, inline validation, review, and consent
4. **Secure access — complete** — verification, signed links, token invalidation, sessions, Manage briefing, theme selection, pause/resume, and confirmed deletion
5. **Landing page — complete** — approved Light Editorial homepage, real entry links, responsive behavior, accessibility, metadata, restrained motion, and performance verification
6. **Source catalogue and news ingestion — complete** — 95 reviewed feeds (48 active), publisher metadata and fail-closed usage governance, atomic feed scheduling, safe RSS/Atom fetching and parsing, deterministic normalization, exact/bounded same-source duplicate handling, source health, and isolated failure recovery
7. **Shared story intelligence — complete** — local deterministic classification and sensitive flags, bounded rule-based candidate search, fail-closed event-consistency clustering, reviewed multilingual event-pair regression data, publisher-family/syndication-aware evidence, one provider call per eligible canonical summary, lazy localization, deterministic local grounding/final verification, generation-only quota guards, production circuit breaking, atomic recovery, and stored article-linked shared outputs
8. **Personalization and scheduling — complete** — eligibility, centralized explicit-preference scoring and quality floor, central-topic exclusions, national→state→city priority, category/subject diversity, exact-version repeat suppression, verified language selection and idempotent shared-localization queueing, timezone/DST-safe daily/weekday/weekend/weekly windows, atomic unique UTC-slot creation, ordered delivery-story snapshots, independent expiring personalization leases, and concurrent scheduler/recovery safety
9. **Briefing delivery and operations — complete** — exact stored-selection rendering across all four email themes, localized HTML/plain text, normalized attribution and direct original links, final pre-SMTP subscriber/preference gate, receipt-aware Gmail/Nodemailer delivery, bounded retries and ambiguous-send protection, owner-only health/control/audit operations, deduplicated alerts, AES-256-GCM backup automation with local/fake/Google Drive adapter boundaries, 7-daily/4-weekly retention, and a proven clean local restore drill
10. **Launch readiness, hosting, and private beta — in progress** — local fail-closed initialization, the zero-cost Vercel Hobby + Supabase Cron/Vault worker design, owner-approved unpublished legal pages, current provider/law review, isolated migration replay, and launch-shape load tests were completed on 19 July 2026. The rejected paid Render blueprint was removed; Docker is only a local/future fallback. Scheduled offsite backup was explicitly deferred for this personal beta. External production provisioning, HTTPS browser and inbox verification, owner scheduled delivery, remaining publisher-terms resolution, launch gates, soak, and staged rollout remain open.

### Deferred Safari HTTPS verification

The Safari failure recorded in `docs/PHASE_4_SECURE_ACCESS.md` occurs while the
local application is served over plain `http://localhost` with production-grade
`Secure` cookies. It is not a prerequisite for Phase 6 and does not justify
weakening the canonical production cookie policy.

During Phase 10, test complete verification and management-link flows in Safari
and Chrome against the real HTTPS staging or production-like origin. Keep
canonical HTTPS cookies using the `__Host-` prefix with `secure: true`. Change
cookie implementation only if the HTTPS test reveals a genuine production
problem. A development-only localhost compatibility policy may be added later
if the owner explicitly needs Safari-based local testing, but it is optional and
must not alter production security.

Phases 6–10 may contain multiple **sequential** milestone tasks when needed.
Each milestone must have a narrow scope, preserve prior work, document its
handoff, and pass proportionate regression checks before the next milestone
starts. Do not run dependent milestones as uncoordinated parallel changes merely
to shorten the calendar.

Security and data-integrity foundations must arrive before real subscriber data
is invited. Legal, reliability, and launch gates remain mandatory even
though they are grouped into broader phases.

---

## 29. Items intentionally not frozen at code level

Planning is complete at the product/architecture level, but implementation still requires detailed artifacts. Future tasks may refine these while preserving the decisions above:

- Exact verified RSS URL catalogue
- Exact database columns/data types/index names
- Exact RLS policies and SQL claim functions
- Exact numeric ranking weights
- Future re-tuning of private rule-based candidate thresholds against a larger held-out real-article dataset
- Production summary model/provider tier after the required pre-launch live public-data-only verification
- Exact token/session expiry beyond confirmed verification expiry
- Production provider rate ceilings after measuring the approved project tier
- Exact source-health alert thresholds
- Exact admin route name and visual layout
- Final target-client email adjustments after Phase 10 client-matrix testing
- Final legal wording after current-law verification
- Exact folder/monorepo structure

These are not invitations to change product behavior. They are engineering details that must be tested and reviewed before being frozen.

---

## 30. Existing artifacts

The project currently includes:

- Completed implementation records for Phases 1–9 under `docs/`
- Full backend automation blueprint PDF: `output/pdf/bulletin-backend-automation-blueprint.pdf`
- Two-page clustering and personalization brief: `output/pdf/bulletin-clustering-personalisation-intelligence.pdf`
- PDF source/build utilities under `tools/`
- Approved landing-page design supplied externally as a standalone HTML file during planning

The PDFs are explanatory companions. This Markdown file is the fastest and most complete context source for future Codex tasks.

---

## 31. Compact end-to-end truth table

| Stage | Input | Core rule | Stored output | Failure outcome |
|---|---|---|---|---|
| Source governance | Candidate feeds | Prefer official/direct, verify role and health | Active source catalogue | Disable/defer source |
| Ingestion | Due active feeds | Fetch once, conditionally, in small isolated batches | Raw normalized article candidates | Retry/isolate visibly |
| Normalization | RSS/Atom entries | Canonicalize before expensive work | Unique article records | Reject malformed/duplicate |
| Candidate search | Local article facts | Compare only recent category/time/topic/geography-plausible candidates | Candidate cluster set | Create new cluster candidate |
| Consistency | Candidate report + cluster facts | Local rules propose; consistency decides | Article-cluster evidence link | Keep separate/conflict |
| Eligibility | Cluster evidence | Strong enough, sensitive claims corroborated | Verified eligible cluster | Quarantine/exclude |
| Summarization | Verified cluster evidence | One canonical shared factual output and one generation attempt | English summary | Fail/exclude visibly |
| Verification | Summary + source evidence | Deterministic citations, numbers, attribution, uncertainty, and lexical grounding | Verified summary | Exclude visibly without another model call |
| Localization | Verified canonical summary | Generate once when needed and preserve facts | Stored Hindi/Malayalam version | Use other verified inventory/fewer stories |
| Personalization | Due user + verified clusters | Explicit preferences, national→state→city, diversity | Ordered selected cluster versions | Shorter/empty briefing |
| Scheduling | User time + timezone | One unique delivery per UTC slot | Pending delivery row | Existing idempotent job wins |
| Rendering | Exact stored delivery selection + theme | Email-safe four-theme HTML/plain text with no content mutation | Final localized message | Fail pending delivery visibly |
| SMTP | Final message + current subscriber gate | Receipt-aware bounded temporary retry | Success/failure/attempt receipt record | Stop permanent or ambiguous retry |
| Management | Signed link | Verify HMAC/version, issue clean short session | Authorized preference view | Reject/send fresh link |
| Deletion | Explicit confirmed POST | Delete subscriber personal data | Deletion audit/non-personal shared data remains | No deletion on GET |

---

## 32. Definition of “done” for Bulletin’s private beta

Bulletin is not done when the landing page looks beautiful or one email sends successfully. It is private-beta ready only when:

- The approved visual system works responsively and accessibly.
- Onboarding prevents duplicate/overwritten accounts.
- Verification and management links are scanner-safe and secure.
- Preferences save atomically and can be recovered for 30 days.
- A verified source catalogue provides credible India-first coverage.
- Clustering passes a manually reviewed regression set.
- Summary/localization tasks are strict, versioned, quota-controlled,
  circuit-broken, and fail closed.
- Every delivered summary has passed evidence verification.
- Personalization obeys categories, custom topics, exclusions, national/state/city priority, diversity, and repeat suppression.
- Schedules are timezone-correct and idempotent.
- Email themes work in target clients.
- Failures are visible and safe to retry.
- Admin control cannot casually violate subscriber intent.
- Privacy and Terms are real and current.
- The launch test gate and soak test pass.
- Rollout begins gradually.

Every unstarted phase still requires explicit owner approval. Updating this
roadmap or preparing a phase prompt does not itself authorize implementation.
