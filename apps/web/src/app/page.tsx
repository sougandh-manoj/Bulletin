import type { Metadata } from "next";
import Link from "next/link";

import {
  BRIEFING_THEME_LABELS,
  NEWS_CATEGORY_LABELS,
  PRODUCT,
  PUBLIC_ROUTES,
} from "@/config/product";

import { LandingNavigation } from "./landing-navigation";
import { LandingScrollReveal } from "./landing-scroll-reveal";
import styles from "./landing.module.css";
import { ThemePreview } from "./theme-preview";

const PAGE_TITLE = `${PRODUCT.name} — ${PRODUCT.landing.title}`;

export const metadata: Metadata = {
  title: { absolute: PAGE_TITLE },
  description: PRODUCT.landing.description,
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    siteName: PRODUCT.name,
    title: PAGE_TITLE,
    description: PRODUCT.landing.description,
  },
  twitter: {
    card: "summary",
    title: PAGE_TITLE,
    description: PRODUCT.landing.description,
  },
};

const interestCategories = [
  "india",
  "world",
  "regional-local",
  "business-economy",
  "technology-ai",
  "science",
  "health",
  "sports",
] as const;

const themes = [
  {
    id: "light-editorial",
    description: "Warm ivory, charcoal type, and a calm editorial rhythm.",
  },
  {
    id: "dark-intelligence",
    description: "Pale blue structure with a focused intelligence-report feel.",
  },
  {
    id: "midnight-brief",
    description: "A true dark edition with warm headlines and quiet blue signals.",
  },
  {
    id: "amber-brief",
    description: "Soft ivory, graphite, and restrained gold details.",
  },
] as const;

function ArrowIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" width="18" height="18">
      <path d="M3 10h13M11.5 4.5 17 10l-5.5 5.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SourceMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" width="14" height="14">
      <path d="M4.5 5.5h7v7h-7zM2 3.5h8" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  );
}

export default function Home() {
  return (
    <div className={styles.page} data-scroll-reveal-root>
      <LandingScrollReveal />
      
      <LandingNavigation />

      <main id="main-content">
        <section className={styles.hero} aria-labelledby="hero-title">
          <div className={styles.heroGrid}>
            <div className={styles.heroCopy} data-reveal-hero>
              <p className={styles.eyebrow}>A personal email news briefing</p>
              <h1 id="hero-title">{PRODUCT.landing.title}</h1>
              <p className={`${styles.heroLede} ${styles.desktopCopy}`}>
                {PRODUCT.landing.description} Receive a finite read at the exact
                time you choose—never an endless feed.
              </p>
              <p className={`${styles.heroLede} ${styles.mobileCopy}`}>
                Your news, filtered hard. A clear email at the time you choose.
              </p>
              <div className={styles.heroActions}>
                <Link className={styles.primaryButton} href={PUBLIC_ROUTES.onboarding}>
                  Create my briefing
                  <ArrowIcon />
                </Link>
                <Link className={styles.mobileManageButton} href={PUBLIC_ROUTES.manageAccess}>
                  Manage briefing
                </Link>
                <a className={styles.textLink} href="#your-briefing">
                  See what arrives
                </a>
              </div>
              <p className={styles.heroNote}>Your interests. Your language. Your time.</p>
            </div>

            <div className={styles.previewWrap} data-reveal-hero aria-label="Illustrative briefing preview">
              <div className={styles.previewStack}>
                <article className={styles.briefingCard}>
                  <header className={styles.briefingMasthead}>
                    <span>{PRODUCT.name}</span>
                    <span>Your morning edition</span>
                  </header>
                  <div className={styles.briefingIntro}>
                    <p>Good morning.</p>
                    <span>Balanced coverage across every category you choose.</span>
                  </div>
                  <div className={styles.featureStory}>
                    <p className={styles.storyCategory}>Technology &amp; AI</p>
                    <h2>A relevant development, distilled into a clear read</h2>
                    <p className={styles.storySummary}>
                      Bulletin presents the central facts in a concise summary, with
                      enough context to understand what changed and what remains uncertain.
                    </p>
                    <p className={styles.whyItMatters}>
                      <strong>Why it matters</strong>
                      A direct line of context connects the update to your interests.
                    </p>
                    <div className={styles.sourceRow} aria-label="Example source treatments">
                      <span><SourceMark />Original report</span>
                      <span><SourceMark />Primary source</span>
                    </div>
                  </div>
                  <div className={styles.compactStories}>
                    <div>
                      <span>Regional &amp; Local</span>
                      <p>A location-aware update without the repetitive coverage.</p>
                    </div>
                    <div>
                      <span>Business &amp; Economy</span>
                      <p>A second story, chosen from the interests you selected.</p>
                    </div>
                  </div>
                  <footer className={styles.briefingFooter}>
                    <span>A finite briefing, prepared for you.</span>
                    <span>Visible sources</span>
                  </footer>
                </article>
              </div>
            </div>
          </div>
        </section>

        <section className={styles.section} id="your-briefing" aria-labelledby="preferences-title">
          <div className={styles.sectionInner}>
            <div className={styles.sectionHeading} data-reveal>
              <p className={styles.eyebrow}>Shaped by you</p>
              <h2 id="preferences-title">Start with what matters to you.</h2>
              <p className={styles.desktopCopy}>
                Choose your interests, add your own topics, and leave out what you
                do not want. Your choices stay explicit and editable.
              </p>
              <p className={styles.mobileCopy}>Pick the topics. Skip the noise.</p>
            </div>

            <div className={styles.preferenceCanvas} data-reveal>
              <div className={styles.categoryCloud} aria-label="Example interests">
                {interestCategories.map((category, index) => (
                  <span
                    key={category}
                    className={index === 0 || index === 3 || index === 4 ? styles.selectedCategory : undefined}
                  >
                    {NEWS_CATEGORY_LABELS[category]}
                  </span>
                ))}
                <span className={styles.customCategory}>+ Your own topic</span>
              </div>
              <div className={styles.preferenceMeta}>
                <p><strong>Included</strong> interests and custom topics</p>
                <p><strong>Excluded</strong> topics you would rather skip</p>
                <p><strong>Location</strong> country, region, and optional city</p>
              </div>
            </div>
          </div>
        </section>

        <section className={`${styles.section} ${styles.paperSection}`} id="how-it-works" aria-labelledby="process-title">
          <div className={styles.sectionInner}>
            <div className={styles.sectionHeading} data-reveal>
              <p className={styles.eyebrow}>How it works</p>
              <h2 id="process-title">From scattered reporting to one clear briefing.</h2>
              <p className={styles.desktopCopy}>
                Bulletin is designed to bring trustworthy reporting together while
                keeping the original sources visible.
              </p>
              <p className={styles.mobileCopy}>Three choices. One concise briefing.</p>
            </div>

            <ol className={styles.steps} data-reveal-group>
              <li data-reveal-item>
                <span className={styles.stepNumber}>01</span>
                <h3>Choose what matters</h3>
                <p>Set your interests, location, language, story count, and appearance.</p>
              </li>
              <li data-reveal-item>
                <span className={styles.stepNumber}>02</span>
                <h3>Reporting is brought together</h3>
                <p>Related coverage can be compared and repeated versions reduced.</p>
              </li>
              <li data-reveal-item>
                <span className={styles.stepNumber}>03</span>
                <h3>Your briefing arrives</h3>
                <p>Receive a concise email at the frequency and exact time you selected.</p>
              </li>
            </ol>
          </div>
        </section>

        <section className={`${styles.section} ${styles.scheduleSection}`} aria-labelledby="schedule-title">
          <div className={styles.sectionInner}>
            <div className={styles.scheduleGrid} data-reveal-group>
              <div className={styles.sectionHeading} data-reveal-item>
                <p className={styles.eyebrow}>Your routine</p>
                <h2 id="schedule-title">Delivered when you choose to read.</h2>
                <p className={styles.desktopCopy}>
                  Choose two to six stories from every selected category, in English, Hindi, or Malayalam, at the
                  exact local delivery time that fits your day.
                </p>
                <p className={styles.mobileCopy}>A finite read. On your clock.</p>
              </div>
              <dl className={styles.scheduleBoard} data-reveal-item>
                <div><dt>Coverage</dt><dd>2–6 per category</dd></div>
                <div><dt>Language</dt><dd>English</dd></div>
                <div><dt>Frequency</dt><dd>Weekdays</dd></div>
                <div className={styles.highlightSchedule}><dt>Delivery time</dt><dd>8:00 AM</dd></div>
                <div><dt>Timezone</dt><dd>Asia/Kolkata</dd></div>
              </dl>
            </div>
            <p className={styles.qualityNote} data-reveal>
              <strong>Trust over volume.</strong> A requested story count is a maximum,
              not a reason to fill your briefing with weaker material.
            </p>
          </div>
        </section>

        <section className={styles.section} id="appearance" aria-labelledby="appearance-title">
          <div className={styles.sectionInner}>
            <div className={styles.sectionHeading} data-reveal>
              <p className={styles.eyebrow}>Appearance</p>
              <h2 id="appearance-title">A briefing that feels right to read.</h2>
              <p className={styles.desktopCopy}>
                Choose an appearance while creating your briefing, then change it
                whenever you like from Manage briefing.
              </p>
              <p className={styles.mobileCopy}>Choose the look while creating your briefing.</p>
            </div>

            <div className={styles.themeGrid} data-reveal-group>
              {themes.map((theme) => (
                <article
                  key={theme.id}
                  className={styles.themeCard}
                  data-reveal-item
                  data-theme={theme.id}
                >
                  <div className={styles.themePreview}>
                    <ThemePreview
                      theme={theme.id}
                      sourceLabels={["Original report", "Primary source"]}
                    />
                  </div>
                  <div className={styles.themeMeta}>
                    <div>
                      <h3>{BRIEFING_THEME_LABELS[theme.id]}</h3>
                      {theme.id === "light-editorial" ? <span>Default</span> : null}
                    </div>
                    <p>{theme.description}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className={`${styles.section} ${styles.trustSection}`} id="why-bulletin" aria-labelledby="trust-title">
          <div className={styles.sectionInner}>
            <div className={styles.trustGrid}>
              <div className={styles.sectionHeading} data-reveal>
                <p className={styles.eyebrow}>A calmer model</p>
                <h2 id="trust-title">Stay informed without living in a feed.</h2>
                <p className={styles.desktopCopy}>{PRODUCT.promise}</p>
                <p className={styles.mobileCopy}>No feed. No doomscroll. Just the briefing.</p>
              </div>
              <div className={styles.trustList} data-reveal-group>
                <article data-reveal-item>
                  <span>01</span>
                  <div><h3>A finite briefing</h3><p>Your email has a beginning and an end—no infinite scroll or engagement loop.</p></div>
                </article>
                <article data-reveal-item>
                  <span>02</span>
                  <div><h3>Sources remain visible</h3><p>Original reporting stays within reach whenever you want to read further.</p></div>
                </article>
                <article data-reveal-item>
                  <span>03</span>
                  <div><h3>You stay in control</h3><p>Manage preferences, pause, resume, or unsubscribe from your briefing at any time.</p></div>
                </article>
              </div>
            </div>
          </div>
        </section>

        <section className={styles.finalCta} aria-labelledby="final-cta-title">
          <div className={styles.sectionInner} data-reveal-group>
            <p className={styles.eyebrow} data-reveal-item>Ready when you are</p>
            <h2 id="final-cta-title" data-reveal-item>A clearer way to follow the news.</h2>
            <p data-reveal-item>Build a concise briefing around what matters to you.</p>
            <Link className={styles.primaryButton} data-reveal-item href={PUBLIC_ROUTES.onboarding}>
              Create my briefing
              <ArrowIcon />
            </Link>
          </div>
        </section>
      </main>

      <footer className={styles.siteFooter}>
        <div className={styles.sectionInner}>
          <div className={styles.footerTop} data-reveal>
            <div>
              <p className={styles.footerWordmark}>{PRODUCT.name}</p>
              <p>{PRODUCT.landing.description}</p>
            </div>
            <nav aria-label="Footer navigation">
              <div>
                <p>Briefing</p>
                <Link href={PUBLIC_ROUTES.onboarding}>Create my briefing</Link>
                <Link href={PUBLIC_ROUTES.manageAccess}>Manage briefing</Link>
              </div>
              <div>
                <p>Explore</p>
                <a href="#how-it-works">How it works</a>
                <a href="#why-bulletin">Why Bulletin</a>
              </div>
            </nav>
          </div>
          <div className={styles.footerBottom}>
            <p>© 2026 {PRODUCT.name}.</p>
            <p>Designed for a calmer way to stay informed.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
