import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { loadTodaysDeliveredBriefing } from "@/data/delivery";
import { getSecureAccessEnvironment } from "@/env/server";
import { createLogger } from "@/lib/logging/logger";
import { getAuthenticatedBulletinSubscriber } from "@/lib/security/authenticated-subscriber";
import { buildDeliveryEmailFromContext } from "@/services/delivery";

import secureStyles from "../../secure-access.module.css";
import { SecureShell } from "../../secure-shell";
import { BriefingFrame } from "./briefing-frame";
import styles from "./briefing.module.css";

export const metadata: Metadata = {
  title: "Today's briefing",
  robots: { index: false, follow: false, noarchive: true },
};
export const dynamic = "force-dynamic";
const logger = createLogger("today-briefing");

function formatDeliveryTime(value: string) {
  const [hour = 0, minute = 0] = value.split(":").map(Number);
  return new Intl.DateTimeFormat("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "UTC",
  }).format(new Date(Date.UTC(2026, 0, 1, hour, minute)));
}

export default async function TodaysBriefingPage() {
  const authenticated = await getAuthenticatedBulletinSubscriber();
  if (!authenticated) redirect("/sign-in?intent=manage");
  if (!authenticated.subscriber) redirect("/onboarding");

  const subscriber = authenticated.subscriber;
  let email: ReturnType<typeof buildDeliveryEmailFromContext> | null = null;
  let loadFailed = false;
  try {
    const briefing = await loadTodaysDeliveredBriefing({
      owner: {
        subscriberId: subscriber.subscriberId,
        subscriberName: subscriber.name,
        timezone: subscriber.timezone,
      },
    });
    if (briefing) {
      const environment = getSecureAccessEnvironment();
      email = buildDeliveryEmailFromContext(
        briefing,
        new URL("/manage", environment.APP_BASE_URL).toString(),
      );
    }
  } catch (error) {
    loadFailed = true;
    logger.error("Today's briefing could not be loaded", { error });
  }

  if (loadFailed) {
    return (
      <SecureShell showSignOut>
        <div className={styles.waiting}>
          <p className={secureStyles.eyebrow}>Today&apos;s Bulletin</p>
          <h1 className={secureStyles.title}>Today&apos;s briefing couldn&apos;t be opened.</h1>
          <p className={secureStyles.lede}>
            Please try again in a few minutes. Your scheduled email delivery is not affected.
          </p>
          <Link className={styles.manageLink} href="/">
            Back to home
          </Link>
        </div>
      </SecureShell>
    );
  }

  if (!email) {
    const deliveryTime = formatDeliveryTime(subscriber.deliveryTime);
    return (
      <SecureShell showSignOut>
        <div className={styles.waiting}>
          <p className={secureStyles.eyebrow}>Today&apos;s Bulletin</p>
          <h1 className={secureStyles.title}>Today&apos;s briefing isn&apos;t ready yet.</h1>
          <p className={secureStyles.lede}>
            Your briefing arrives at the time you scheduled it. Today&apos;s edition
            will appear here as soon as it has been delivered to your inbox.
          </p>
          <div className={styles.waitingPanel}>
            <p>
              Scheduled delivery: <strong>{deliveryTime}</strong> in your local timezone.
            </p>
            <Link className={styles.manageLink} href="/manage">
              Review delivery settings
            </Link>
          </div>
        </div>
      </SecureShell>
    );
  }

  return (
    <SecureShell showSignOut>
      <div className={styles.content}>
        <div className={styles.heading}>
          <p className={secureStyles.eyebrow}>Today&apos;s Bulletin</p>
          <h1 className={secureStyles.title}>Today&apos;s briefing.</h1>
        </div>
        <BriefingFrame html={email.html} title={email.subject} />
      </div>
    </SecureShell>
  );
}
