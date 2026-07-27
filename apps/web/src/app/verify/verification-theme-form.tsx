"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import styles from "../secure-access.module.css";

export default function VerificationThemeForm({ intent }: { intent: string }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const confirm = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/secure/verification/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent }),
      });
      const result = await response.json() as { ok?: boolean; message?: string };
      if (!response.ok || !result.ok) {
        setError(result.message ?? "This verification link is no longer available.");
        return;
      }
      router.replace("/confirmed");
      router.refresh();
    } catch {
      setError("We couldn’t start your Bulletin just now. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={confirm}>
      <section className={styles.narrow} aria-labelledby="confirmation-heading">
        <p className={styles.eyebrow}>Confirm email</p>
        <h1 id="confirmation-heading" className={styles.title}>Start your Bulletin.</h1>
        <p className={styles.lede}>
          Confirm this email address and your briefing will follow the delivery time you chose.
        </p>

        <div className={styles.actions}>
          <button className={styles.button} type="submit" disabled={submitting}>
            {submitting ? "Confirming…" : "Confirm my Bulletin"}
          </button>
        </div>
        {error && <p className={styles.error} role="alert">{error}</p>}
      </section>
    </form>
  );
}
