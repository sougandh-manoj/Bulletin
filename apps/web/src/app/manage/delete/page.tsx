import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getAuthenticatedSubscriber } from "@/lib/security/session";

import styles from "../../secure-access.module.css";
import { SecureShell } from "../../secure-shell";
import DeleteForm from "./delete-form";

export const metadata: Metadata = { title: "Delete Bulletin", robots: { index: false, follow: false } };

export default async function DeletePage() {
  const authenticated = await getAuthenticatedSubscriber();
  if (!authenticated) redirect("/manage/access?state=session");

  return (
    <SecureShell linkHref="/manage" linkLabel="Keep my Bulletin">
      <div className={styles.narrow}>
        <p className={styles.eyebrow}>Before you go</p>
        <h1 className={styles.title}>Unsubscribe and delete.</h1>
        <section className={styles.card}>
          <h2>What will be removed</h2>
          <ul className={styles.confirmationList}>
            <li>Subscriber profile and saved preferences</li>
            <li>Schedule, access tokens, and active sessions</li>
            <li>Personal delivery records connected to this subscriber</li>
          </ul>
          <p>Permitted shared, non-personal public news records remain.</p>
          <DeleteForm csrfToken={authenticated.csrfToken} />
        </section>
      </div>
    </SecureShell>
  );
}
