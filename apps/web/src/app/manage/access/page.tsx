import type { Metadata } from "next";

import styles from "../../secure-access.module.css";
import { SecureShell } from "../../secure-shell";
import AccessForm from "./access-form";

export const metadata: Metadata = { title: "Manage briefing", robots: { index: false, follow: false } };

export default async function ManageAccessPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>;
}) {
  const { state } = await searchParams;
  const notice = state === "limited"
    ? "Please wait a moment and try again."
    : state === "session"
      ? ""
      : state === "invalid"
        ? "That link is no longer available. Request a new one."
        : state === "unavailable"
          ? "We couldn’t open that link. Please try again."
          : "";

  return (
    <SecureShell>
      <div className={styles.narrow}>
        <p className={styles.eyebrow}>Welcome back</p>
        <h1 className={styles.title}>Manage your briefing.</h1>
        <p className={styles.lede}>Enter your email to continue.</p>
        <section className={styles.card}>
          {notice && <p className={styles.status}>{notice}</p>}
          <AccessForm />
        </section>
      </div>
    </SecureShell>
  );
}
