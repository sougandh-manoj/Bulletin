# Bulletin Phase 5 — Landing Page

Status: complete on 16 July 2026.

## Scope and phase boundary

Phase 5 replaces the Phase 1 foundation placeholder at `/` with Bulletin's approved premium Light Editorial landing page. The page introduces the product, explains the finite personalised email briefing, and sends visitors into the completed Phase 3–4 entry routes.

This phase does not change onboarding, subscriber creation, verification, theme confirmation, management access, preference saving, pause/resume, deletion, database behavior, email templates, security boundaries, or subscriber delivery behavior. It does not begin source ingestion or any later pipeline.

## Delivered

- A complete responsive Light Editorial homepage using warm ivory and cream surfaces, charcoal type, muted editorial blue, fine warm borders, restrained shadows, editorial-serif headlines, and compact interface typography.
- A concise hero that explains the product and places **Create my briefing** within the first mobile screen.
- An explicitly labelled illustrative briefing preview that demonstrates a finite story set, summary, Why it matters treatment, and visible source treatments without implying finalized publisher coverage or a live production pipeline.
- Sections covering explicit interests and exclusions, location, language, story count, frequency, exact delivery time, the four existing briefing themes, finite briefings, visible sources, and management/pause/resume/unsubscribe control.
- A keyboard-aware mobile navigation drawer with focus entry, focus containment, Escape close, focus return, background-scroll locking, and comfortable touch targets.
- Real links throughout: **Create my briefing** opens `/onboarding`; **Manage briefing** opens `/manage/access`; same-page navigation targets real section IDs. No placeholder controls or legal links were added.
- Homepage title, description, indexing instructions, Open Graph metadata, and Twitter summary metadata.
- Centralized reusable public landing copy and public route constants in the existing product configuration.

## Page structure and interactions

1. Sticky masthead with section navigation, subtle Manage briefing access, and the primary CTA.
2. Hero and illustrative inbox briefing preview.
3. Explicit preference and topic composition.
4. Three-step product explanation.
5. Annotated story anatomy with source visibility.
6. Subscriber-controlled story count, language, frequency, time, and timezone.
7. Light Editorial, Signal Brief, Midnight Brief, and Amber Brief appearance previews.
8. Dark editorial trust section explaining the finite format, visible sources, and subscriber controls.
9. Final onboarding CTA and restrained footer navigation.

The homepage content remains server-rendered. Client-side behavior is limited to the mobile navigation and dynamically imported GSAP animations for the hero entrance, scroll-triggered section reveals, and smooth same-page navigation. GSAP is the landing page's only additional runtime dependency.

## Design decisions

- The approved standalone landing-page reference remains the visual baseline. Its warm palette, typography hierarchy, asymmetrical hero, briefing card, editorial labels, fine rules, and dark trust section were retained and adapted to the Next.js application.
- Mobile hero spacing and type were tightened so the primary action appears before the illustrative preview and well within the first 390 px viewport screen.
- Reference-only category controls were converted into static illustrative chips. This avoids presenting non-functional buttons on the public page; real selection remains in onboarding.
- The reference's two-theme comparison was expanded to the four themes already completed in Phase 4, using the existing centralized theme labels.
- Real publisher names and factual sample-news claims were removed from the public preview. Generic source treatments and clearly illustrative copy communicate the design without fabricated endorsements or unverified coverage claims.
- Manage briefing remains subtle in the desktop header, mobile drawer, and footer. It is not promoted as a hero block.
- Landing styles are isolated in a CSS Module. Shared global styles and all completed-flow style modules remain unchanged.

## Accessibility checks

- Semantic banner, navigation, main, section, article, description-list, and footer landmarks.
- One page `h1`, section-level `h2` headings, and nested `h3` headings.
- Skip-to-content link with a visible focused position.
- Meaningful CTA and navigation link text.
- Mobile menu exposes its expanded state and controlled region, has a labelled dialog/navigation structure, moves focus to the first item, contains focus, closes with Escape, returns focus to the toggle, and locks background scrolling while open.
- All interactive elements have a high-visibility 3 px focus outline with a 4 px offset.
- Minimum 44 px header/navigation targets and 48 px primary targets, with full-width mobile CTAs.
- Decorative SVGs and preview-only graphics are hidden from assistive technology; illustrative groups have descriptive labels.
- Content does not rely on colour alone: selected preference examples also use borders, surfaces, and text; numbered story annotations remain textual.
- Representative contrast ratios were calculated after the final palette adjustment: charcoal on ivory 15.94:1, body graphite on ivory 5.54:1, secondary graphite on ivory 4.71:1, editorial blue on ivory 5.97:1, white button text on editorial blue 6.61:1, and muted light text on the dark trust surface 8.79:1.
- Compiled CSS was inspected to confirm the visible `:focus-visible` rule and the `prefers-reduced-motion: reduce` override.

## Responsive, motion, and performance checks

- Desktop verified at 1440 × 900.
- Tablet verified at 834 × 1112 with a single-column hero and responsive mobile navigation.
- Mobile verified at 390 × 844.
- Narrow mobile verified at 320 × 800; the compact header correctly leaves the primary action in the hero and retains the drawer CTA.
- `document.documentElement.scrollWidth` equalled the viewport width at 1440, 834, 390, and 320 px; no horizontal overflow was found.
- The mobile hero CTA appeared within the first screen at both 390 and 320 px.
- Light, Signal, Midnight, and Amber theme cards stack cleanly on mobile; dark-section text remains readable.
- Motion includes a short GSAP hero entrance, one-time scroll-triggered section reveals, smooth GSAP navigation to the three masthead section targets, the drawer entry transition, subtle card lift, and hover/focus transitions. Reduced-motion handling skips the GSAP reveals, makes section navigation immediate, and reduces CSS animation and transition durations to effectively zero. No continuous scroll hijacking or comprehension-dependent animation exists.
- The page uses no stock imagery or external image assets. The main content stays server-rendered; the mobile navigation and motion controller are hydrated, while GSAP, ScrollTrigger, and ScrollToPlugin are dynamically imported only in the browser.

## Validation completed

### Before implementation

- ESLint: passed.
- TypeScript: passed.
- Web test suite: 18 files and 71 tests passed.
- Production build: passed after rerunning outside the filesystem sandbox, whose local worker port restriction caused the first unchanged build attempt to fail before compilation.
- Existing `/`, `/onboarding`, and `/manage/access` screens were inspected in the browser before editing.
- The workspace contains no Git metadata, so no Git working-tree status was available; changes were kept to the explicitly listed files.

### After implementation

- ESLint: passed.
- TypeScript: passed.
- Complete web test suite: 18 files and 71 tests passed.
- Production build: passed; `/` remains statically prerendered and every existing Phase 1–4 route remains present.
- Homepage title, description, robots, Open Graph, and Twitter metadata were confirmed in the rendered document.
- **Create my briefing** was clicked from the mobile hero and opened the existing `/onboarding` screen with the expected five-step heading.
- **Manage briefing** was clicked from the mobile drawer and opened the existing `/manage/access` screen.
- Mobile drawer focus entry, Escape close, focus return, expanded state, background-scroll lock, and link visibility were confirmed.
- No browser console warning or error was found on the completed desktop homepage.
- Browser DOM inspection confirmed the expected heading hierarchy, semantic landmarks, four theme cards, real route destinations, and absence of horizontal overflow.

The successful build emitted the existing Supabase JavaScript client's Node-version deprecation notice during worker page-data collection even though the shell runtime is Node 24.18.0. It did not affect compilation, static generation, tests, or routes.

## Files changed

- `apps/web/src/app/page.tsx`
- `apps/web/src/app/landing-navigation.tsx`
- `apps/web/src/app/landing-scroll-reveal.tsx`
- `apps/web/src/app/landing.module.css`
- `apps/web/src/config/product.ts`
- `apps/web/src/config/product.test.ts`
- `apps/web/package.json`
- `package-lock.json`
- `docs/PHASE_5_LANDING_PAGE.md`

## Remaining pre-production checks

- Retest the complete verification and management-link exchange in Safari after the separately approved localhost cookie-policy compatibility work. Do not weaken canonical HTTPS cookie security.
- Add the canonical production origin and a final share image when deployment identity and hosting are approved. Current metadata already supplies the production page title, description, indexing, Open Graph, and Twitter text fields.
- Privacy and Terms remain intentionally absent from navigation until their later approved phase produces real product-specific pages.

No Phase 5 owner decision is blocked. No deployment, live email, remote Supabase change, or external side effect was performed.

## Phase 6 handoff

Phase 6 is the source catalogue and ingestion phase. It has not started.

Before beginning Phase 6, read the master context, Phase 1–5 records, and every applicable `AGENTS.md`. Preserve the completed landing, onboarding, secure access, database, and email behavior. Phase 6 should add only the approved verified source catalogue, feed scheduling, parsing, normalization, health tracking, and associated tests after explicit owner approval. It must not silently begin clustering, Gemini processing, personalization, delivery scheduling, production email delivery, admin tooling, backup automation, deployment, or final legal pages.
