import type { Metadata } from "next";
import Link from "next/link";

import { PRODUCT } from "@/config/product";

import styles from "../legal.module.css";

export const metadata: Metadata = {
  title: "Terms",
  description: "Terms for participating in the Bulletin private beta.",
  robots: { index: false, follow: false },
};

export default function Terms() {
  return <div className={styles.page}>
    <header className={styles.header}><Link className={styles.brand} href="/">{PRODUCT.name}</Link><Link className={styles.back} href="/">Back to Bulletin</Link></header>
    <main className={styles.main}>
      <p className={styles.eyebrow}>Private beta</p>
      <h1>Terms of Service</h1>
      <p className={styles.updated}>Approved for the private beta · prepared 19 July 2026 · not yet published externally</p>
      <p className={styles.notice}>These terms apply to invited participants aged 18 or older in Bulletin’s small, non-commercial private beta. By deliberately confirming your subscription, you confirm that you are at least 18 and agree to these terms and the Privacy Policy.</p>

      <section className={styles.section}><h2>1. The service</h2><p>Bulletin provides a finite, personalized email news briefing based on explicit preferences and a schedule you choose. It gathers public news metadata, groups related reporting, creates shared automated summaries, checks them, selects eligible stories, and links to original publishers.</p><p>The beta is experimental. Features, sources, providers, and availability may change, and the service may be paused or ended.</p></section>
      <section className={styles.section}><h2>2. No completeness or timing guarantee</h2><p>Bulletin does not promise complete news coverage, a particular number of stories, uninterrupted service, or exact inbox arrival. It may send a shorter or zero-story briefing when reliable matching material is unavailable. The system aims to begin test sends close to the selected time, but email providers control final delivery.</p></section>
      <section className={styles.section}><h2>3. Informational summaries</h2><p>Bulletin’s headlines, summaries, localizations, categories, and “Why it matters” text are automated informational aids. They may contain mistakes, omit context, or become outdated. They are not professional, legal, medical, financial, investment, safety, or other specialist advice. Important decisions should be checked against the linked original sources and suitable professionals.</p></section>
      <section className={styles.section}><h2>4. Publishers and ownership</h2><p>Original reporting, trademarks, logos, and publisher materials belong to their respective owners. Bulletin does not claim ownership of third-party reporting and does not replace it. Source links may change, fail, move behind access controls, or be removed by publishers. Your use of a publisher’s site is governed by that publisher’s terms.</p></section>
      <section className={styles.section}><h2>5. Eligibility and your responsibilities</h2><ul><li>be at least 18 years old when you confirm and use the private beta;</li><li>provide an email address you control and accurate scheduling information;</li><li>keep verification, management, and owner-access links private;</li><li>use Bulletin only for lawful, personal private-beta participation;</li><li>do not probe, disrupt, automate abuse of, reverse engineer, or bypass security and rate limits; and</li><li>do not use the service or summaries to infringe rights or misrepresent Bulletin or a publisher.</li></ul></section>
      <section className={styles.section}><h2>6. Email and account controls</h2><p>Bulletin uses passwordless email links. Anyone with access to a valid private link may be able to manage the associated briefing during its validity period. You may pause, resume, or confirm deletion through Manage briefing. Bulletin may pause delivery or invalidate access when necessary to protect the service, comply with law, respond to abuse, or address a security or reliability incident.</p></section>
      <section className={styles.section}><h2>7. Beta access and termination</h2><p>Access is by invitation during the private beta and may be limited by capacity. You may leave at any time by confirming deletion. The operator may suspend or end the beta, an account, or a feature for safety, abuse, legal, provider, or operational reasons. Where practical, reasonable notice will be given.</p></section>
      <section className={styles.section}><h2>8. Disclaimers and liability</h2><p>To the extent permitted by applicable law, Bulletin is provided “as is” and “as available,” without warranties of accuracy, completeness, availability, fitness for a particular purpose, or non-infringement. Nothing in these terms excludes a right or liability that cannot lawfully be excluded. Subject to that limit, the operator is not responsible for indirect or consequential loss arising from use of, inability to use, or reliance on the beta or third-party content.</p></section>
      <section className={styles.section}><h2>9. Privacy and changes</h2><p>The Privacy Policy describes how personal data is handled. These terms may change as the beta develops or law and providers change. Material revisions will be dated and communicated where appropriate. Continued use after notice means you accept the revised terms; you may instead delete your Bulletin.</p></section>
      <section className={styles.section}><h2>10. Governing law and contact</h2><p>These terms are governed by the laws of India. Courts and statutory forums with jurisdiction under applicable Indian law retain jurisdiction; these terms do not remove mandatory consumer or data-protection rights. Please first send questions or concerns to <a href="mailto:sougandh.manoj4@gmail.com">sougandh.manoj4@gmail.com</a>.</p></section>
    </main>
    <footer className={styles.footer}>Bulletin · A private-beta email briefing</footer>
  </div>;
}
