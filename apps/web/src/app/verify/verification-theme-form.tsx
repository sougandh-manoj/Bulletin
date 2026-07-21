"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import {
  BRIEFING_THEME_LABELS,
  BRIEFING_THEMES,
  type BriefingTheme,
} from "@/config/product";

import styles from "../secure-access.module.css";
import { ThemePreview, themeCardClassName } from "../theme-preview";

export default function VerificationThemeForm({ intent }: { intent: string }) {
  const router = useRouter();
  const [theme, setTheme] = useState<BriefingTheme>("light-editorial");
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
        body: JSON.stringify({ intent, theme }),
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
      <section aria-labelledby="appearance-heading">
        <p className={styles.eyebrow}>Choose your theme</p>
        <h1 id="appearance-heading" className={styles.title}>How should your Bulletin look?</h1>
        <p className={styles.lede}>Preview the same sample briefing in each edition.</p>

        <div className={styles.themes}>
          {BRIEFING_THEMES.map((option) => (
            <div className={styles.themeOption} key={option}>
              <p className={styles.themeOptionLabel}>{BRIEFING_THEME_LABELS[option]}</p>
              <button
                type="button"
                className={`${styles.themeCard} ${themeCardClassName(option)}`}
                aria-label={`Select ${BRIEFING_THEME_LABELS[option]} theme`}
                data-selected={theme === option}
                aria-pressed={theme === option}
                disabled={submitting}
                onClick={() => setTheme(option)}
              >
                <ThemePreview theme={option} />
              </button>
            </div>
          ))}
        </div>

        <div className={`${styles.actions} ${styles.themeStartActions}`}>
          <button className={styles.button} type="submit" disabled={submitting}>
            {submitting ? "Starting your Bulletin…" : "Start my Bulletin"}
          </button>
          <p className={styles.themeSelectionNote} aria-live="polite">
            {BRIEFING_THEME_LABELS[theme]} selected
          </p>
        </div>
        {error && <p className={styles.error} role="alert">{error}</p>}
      </section>
    </form>
  );
}
