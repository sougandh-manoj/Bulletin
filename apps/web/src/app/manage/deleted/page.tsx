import type { Metadata } from "next";
import Link from "next/link";

import styles from "../../secure-access.module.css";
import { SecureShell } from "../../secure-shell";

export const metadata: Metadata = { title: "Bulletin deleted", robots: { index: false, follow: false } };

export default function DeletedPage() {
  return (
    <SecureShell>
      <div className={styles.narrow}>
        <p className={styles.eyebrow}>Deletion complete</p>
        <h1 className={styles.title}>Your Bulletin has been deleted.</h1>
        <p className={styles.lede}>Delivery is stopped and the subscriber-related personal data was removed. Repeating or refreshing this page cannot delete anything else.</p>
        <section className={styles.card}>
          <h2>Thank you for reading.</h2>
          <p>If you ever return, you can create a completely new briefing.</p>
          <Link className={styles.textLink} href="/onboarding">Create a new Bulletin</Link>
        </section>
      </div>
    </SecureShell>
  );
}
