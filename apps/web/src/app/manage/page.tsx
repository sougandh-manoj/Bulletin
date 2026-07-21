import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getAuthenticatedSubscriber } from "@/lib/security/session";

import styles from "../secure-access.module.css";
import { SecureShell } from "../secure-shell";
import ManageBriefing from "./manage-briefing";

export const metadata: Metadata = { title: "Manage briefing", robots: { index: false, follow: false } };

export default async function ManagePage() {
  const authenticated = await getAuthenticatedSubscriber();
  if (!authenticated) redirect("/manage/access?state=session");
  const subscriber = authenticated.subscriber;

  return (
    <SecureShell linkHref="/" linkLabel="Finish for now">
      <p className={styles.eyebrow}>Your Bulletin</p>
      <h1 className={styles.title}>Manage briefing.</h1>
      <ManageBriefing
        csrfToken={authenticated.csrfToken}
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
