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

function GoogleIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path fill="#4285f4" d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.87h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.89-1.74 2.98-4.31 2.98-7.35Z" />
      <path fill="#34a853" d="M12 22c2.7 0 4.97-.9 6.62-2.42l-3.24-2.51c-.89.6-2.03.95-3.38.95-2.6 0-4.81-1.76-5.6-4.12H3.06v2.59A10 10 0 0 0 12 22Z" />
      <path fill="#fbbc05" d="M6.4 13.9A6 6 0 0 1 6.09 12c0-.66.11-1.3.31-1.9V7.51H3.06A10 10 0 0 0 2 12c0 1.61.39 3.14 1.06 4.49L6.4 13.9Z" />
      <path fill="#ea4335" d="M12 5.98c1.47 0 2.79.5 3.82 1.49L18.7 4.6A9.68 9.68 0 0 0 12 2a10 10 0 0 0-8.94 5.51L6.4 10.1c.79-2.36 3-4.12 5.6-4.12Z" />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path fill="currentColor" d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.32.03-1.75-.79-3.27-.79-1.53 0-2 .76-3.25.82-1.3.05-2.29-1.33-3.13-2.57-1.7-2.46-3-6.94-1.25-9.99.87-1.52 2.43-2.48 4.1-2.51 1.28-.02 2.49.87 3.27.87.78 0 2.24-1.07 3.78-.91.64.03 2.44.26 3.6 1.96-.09.06-2.15 1.26-2.13 3.75.03 2.98 2.62 3.97 2.65 3.98-.02.07-.41 1.42-1.36 2.92ZM13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11Z" />
    </svg>
  );
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
        <p className={styles.lede}>Choose an account to continue.</p>
        <section className={styles.signInActions}>
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
              <span className={styles.providerIcon}><GoogleIcon /></span>
              <span className={styles.providerLabel}>Continue with Google</span>
            </Link>
            <button
              className={`${styles.providerButton} ${styles.appleButton}`}
              type="button"
              disabled
            >
              <span className={styles.providerIcon}><AppleIcon /></span>
              <span className={styles.providerLabel}>
                <span>Continue with Apple</span>
                <span className={styles.comingSoon}>Coming soon</span>
              </span>
            </button>
          </div>
        </section>
      </div>
    </SecureShell>
  );
}
