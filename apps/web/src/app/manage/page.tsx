import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getAuthenticatedBulletinSubscriber } from "@/lib/security/authenticated-subscriber";

import styles from "../secure-access.module.css";
import { SecureShell } from "../secure-shell";
import ManageBriefing from "./manage-briefing";

export const metadata: Metadata = { title: "Manage briefing", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function ManagePage() {
  const authenticated = await getAuthenticatedBulletinSubscriber();
  if (!authenticated) redirect("/sign-in?intent=manage");
  if (!authenticated.subscriber) {
    return (
      <SecureShell linkLabel={null}>
        <div className={styles.narrow}>
          <p className={styles.eyebrow}>Your Bulletin</p>
          <h1 className={styles.title}>No Bulletin found for this account.</h1>
          <p className={styles.lede}>
            Create a briefing for the signed-in account instead.
          </p>
          <section className={styles.card}>
            <Link className={styles.button} href="/onboarding">
              Create my briefing
            </Link>
          </section>
        </div>
      </SecureShell>
    );
  }
  const subscriber = authenticated.subscriber;

  return (
    <SecureShell linkLabel={null}>
      <p className={styles.eyebrow}>Your Bulletin</p>
      <h1 className={styles.title}>Manage briefing.</h1>
      <ManageBriefing
        csrfToken=""
        initial={{
          name: subscriber.name,
          status: subscriber.status,
          preferenceVersion: subscriber.preferenceVersion,
          countryCode: subscriber.countryCode,
          stateRegion: subscriber.stateRegion,
          city: subscriber.city,
          language: subscriber.language,
          categories: subscriber.categories,
          customTopics: subscriber.customTopics,
          excludedTopics: subscriber.excludedTopics,
          storyCount: subscriber.storyCount,
          theme: subscriber.theme,
          frequency: subscriber.frequency,
          weeklyDay: subscriber.weeklyDay,
          deliveryTime: subscriber.deliveryTime,
          timezone: subscriber.timezone,
          nextDeliveryAt: subscriber.nextDeliveryAt,
        }}
      />
    </SecureShell>
  );
}
