import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getAuthenticatedSubscriber } from "@/lib/security/session";
import { formatDeliveryDateTime } from "@/lib/presentation/date-time";

import styles from "../secure-access.module.css";
import { SecureShell } from "../secure-shell";

export const metadata: Metadata = { title: "Email confirmed", robots: { index: false, follow: false } };

export default async function ConfirmedPage() {
  const authenticated = await getAuthenticatedSubscriber();
  if (!authenticated) redirect("/manage/access?state=session");

  const subscriber = authenticated.subscriber;
  const deliveryMessage = subscriber.nextDeliveryAt
    ? `Your first Bulletin will arrive on ${formatDeliveryDateTime(subscriber.nextDeliveryAt, subscriber.timezone)}.`
    : "You’re subscribed. We’re preparing your first delivery time now.";

  return (
    <SecureShell linkHref="/manage" linkLabel="Manage briefing">
      <div className={styles.narrow}>
        <p className={styles.eyebrow}>You’re all set</p>
        <h1 className={styles.title}>You’re subscribed.</h1>
        <p className={styles.lede}>{deliveryMessage}</p>

        <div className={`${styles.actions} ${styles.completionActions}`}>
          <Link className={styles.button} href="/">Finish</Link>
          <Link className={styles.textLink} href="/manage">Manage briefing</Link>
        </div>
      </div>
    </SecureShell>
  );
}
