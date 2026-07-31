import type { Metadata } from "next";
import Link from "next/link";

import styles from "../secure-access.module.css";
import { SecureShell } from "../secure-shell";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

type AuthIntent = "create" | "manage";
type AuthProvider = "apple" | "google";

function normalizeIntent(value: string | undefined): AuthIntent {
  return value === "manage" ? "manage" : "create";
}

function normalizeProvider(value: string | undefined): AuthProvider {
  return value === "apple" ? "apple" : "google";
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ intent?: string; provider?: string; state?: string }>;
}) {
  const { intent: rawIntent, provider: rawProvider, state } = await searchParams;
  const intent = normalizeIntent(rawIntent);
  const unavailableProvider = normalizeProvider(rawProvider);
  const googleHref = `/auth/sign-in?intent=${intent}&provider=google`;

  return (
    <SecureShell>
      <div className={styles.narrow}>
        <p className={styles.eyebrow}>
          {intent === "manage" ? "Welcome back" : "Create your Bulletin"}
        </p>
        <h1 className={styles.title}>Sign in to continue.</h1>
        <p className={styles.lede}>
          Use the account that should own this private briefing.
        </p>
        <section className={styles.card}>
          {state === "coming-soon" && (
            <p className={styles.status}>Apple sign-in is coming soon.</p>
          )}
          {state === "unavailable" && (
            <p className={styles.status}>
              {unavailableProvider === "apple" ? "Apple" : "Google"} sign-in
              could not be prepared. Try again in a moment.
            </p>
          )}
          <div className={styles.authActions}>
            <Link
              className={`${styles.providerButton} ${styles.googleButton}`}
              href={googleHref}
            >
              Continue with Google
            </Link>
            <button
              className={`${styles.providerButton} ${styles.appleButton}`}
              type="button"
              disabled
            >
              <span>Continue with Apple</span>
              <span className={styles.comingSoon}>Coming soon</span>
            </button>
          </div>
        </section>
      </div>
    </SecureShell>
  );
}
