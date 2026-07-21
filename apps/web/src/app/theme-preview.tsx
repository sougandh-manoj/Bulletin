/* eslint-disable @next/next/no-img-element */

import type { BriefingTheme } from "@/config/product";

import styles from "./secure-access.module.css";

export function themeCardClassName(theme: BriefingTheme) {
  switch (theme) {
    case "dark-intelligence":
      return styles.signalTheme;
    case "midnight-brief":
      return styles.midnightTheme;
    case "amber-brief":
      return styles.amberTheme;
    default:
      return styles.lightTheme;
  }
}

export function ThemePreview({
  theme,
  sourceLabels,
}: {
  theme: BriefingTheme;
  sourceLabels?: readonly [string, string];
}) {
  const signal = theme === "dark-intelligence";
  const midnight = theme === "midnight-brief";
  const amber = theme === "amber-brief";
  const previewClass = midnight
    ? styles.midnightPreview
    : amber
      ? styles.amberPreview
    : signal
      ? styles.intelligencePreview
      : styles.editorialPreview;
  const sourcePills = sourceLabels ? (
    <>
      {sourceLabels.map((source) => (
        <span className={styles.sourceBadge} data-text-only="true" key={source}>
          <span>{source}</span>
        </span>
      ))}
    </>
  ) : (
    <>
      <span className={styles.sourceBadge}>
        <img
          className={styles.sourceIcon}
          src="https://m.timesofindia.com/touch-icon-ipad-retina-precomposed.png"
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
        />
        <span>The Times of India</span>
      </span>
      <span className={styles.sourceBadge}>
        <img
          className={styles.sourceIcon}
          src="https://www.reuters.com/favicon.ico"
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
        />
        <span>Reuters</span>
      </span>
    </>
  );

  return (
    <span
      className={`${styles.briefingPreview} ${previewClass}`}
      aria-hidden="true"
    >
      <span className={styles.previewTopline}>
        <span className={styles.previewBrand}>
          {(signal || midnight) && <span className={styles.signalDot} />}
          Bulletin
        </span>
        <span>{signal || midnight ? "11.07 · 07:30" : "Friday · 11 July"}</span>
      </span>

      <span className={styles.previewIntro}>
        <span className={styles.previewKicker}>
          {signal || midnight || amber ? "Personal intelligence brief" : "Your morning briefing"}
        </span>
        <span className={styles.previewGreeting}>
          {midnight ? "Good evening, Ananya." : signal || amber ? "Morning, Ananya." : "Good morning, Ananya."}
        </span>
        <span className={styles.previewDeck}>
          {amber
            ? "Three high-signal developments matched to your briefing profile."
            : signal || midnight
            ? "Three high-signal developments prepared around your interests."
            : "Three carefully selected stories, prepared around your interests."}
        </span>
      </span>

      <span className={styles.previewDivider} />

      <span className={styles.previewStory}>
        <span className={styles.previewMeta}>
          {amber ? (
            <span className={styles.amberMetaCategory}>
              <span className={styles.amberCategoryMark}>AI</span>
              Technology &amp; AI
            </span>
          ) : (
            <span>{midnight ? "Technology & AI" : "Technology & AI · Sample"}</span>
          )}
          <span>{signal || midnight || amber ? "Signal 01" : "4 min read"}</span>
        </span>
        <span className={styles.previewHeadline}>
          A cleaner path for the next generation of Indian startups
        </span>
        <span className={styles.previewSummary}>
          {midnight || amber
            ? "A new policy proposal focuses on research access, early-stage support, and clearer pathways for emerging technology companies."
            : "A proposed research framework gives early-stage teams clearer routes from public labs to commercial pilots."}
        </span>
        <span className={styles.previewWhy}>
          <b>Why it matters:</b> A clearer route from research to market.
        </span>
        <span
          className={`${styles.previewSources} ${
            midnight ? styles.midnightSources : amber ? styles.amberSources : ""
          }`}
        >
          <span className={`${styles.sourceLead} ${amber ? styles.amberSourceLead : ""}`}>
            {amber && <span className={styles.amberVerifiedMark}>✓</span>}
            {signal || midnight || amber ? "Verified across" : "Example sources"}
          </span>
          {sourcePills}
        </span>
      </span>

      {midnight ? (
        <span className={`${styles.previewTeaser} ${styles.midnightTeaser}`}>
          <span className={styles.midnightTeaserMeta}>
            <span>02</span>
            <span aria-hidden="true">|</span>
            <span>Technology &amp; AI</span>
          </span>
          <span className={styles.midnightTeaserHeadline}>
            Researchers report progress in longer-term battery storage
          </span>
        </span>
      ) : amber ? (
        <span className={`${styles.previewTeaser} ${styles.amberTeaser}`}>
          <span className={styles.amberTeaserMeta}>
            <span className={styles.amberTeaserNumber}>02</span>
            <span>Health &amp; Life Sciences</span>
            <span>Signal 02</span>
          </span>
          <span className={styles.amberTeaserHeadline}>
            Breakthrough in low-cost diagnostics for early disease detection
          </span>
        </span>
      ) : (
        <span className={styles.previewTeaser}>
          <span>02</span>
          Researchers map a quieter route to cleaner city transport
        </span>
      )}
    </span>
  );
}
