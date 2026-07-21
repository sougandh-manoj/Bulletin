"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

import styles from "../../secure-access.module.css";

export default function AccessForm() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [state, setState] = useState<"idle" | "sent" | "new" | "expired">("idle");
  const [message, setMessage] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setMessage("");
    try {
      const response = await fetch("/api/secure/manage/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const result = await response.json() as {
        ok?: boolean;
        state?: "verified" | "pending" | "new" | "expired";
        emailSent?: boolean;
        message?: string;
      };
      if (!response.ok || !result.ok) {
        setMessage(result.message ?? "We couldn’t send the link. Please try again.");
        return;
      }
      if (result.state === "new" || result.state === "expired") {
        setState(result.state);
      } else if (result.emailSent) {
        setState("sent");
      }
    } catch {
      setMessage("We couldn’t send the link. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <form className={styles.form} onSubmit={submit} noValidate>
        <div className={styles.field}>
          <label htmlFor="access-email">Email address</label>
          <input
            id="access-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            required
            maxLength={254}
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              setState("idle");
              setMessage("");
            }}
            placeholder="you@example.com"
          />
        </div>
        <button className={styles.button} type="submit" disabled={submitting}>
          {submitting ? "Sending…" : "Send link"}
        </button>
      </form>

      <div aria-live="polite" style={{ marginTop: 18 }}>
        {state === "sent" && (
          <div className={styles.inboxNotice} role="status">
            <span className={styles.inboxNoticeMark} aria-hidden="true">✓</span>
            <div>
              <p className={styles.inboxNoticeTitle}>Check your inbox.</p>
              <p className={styles.inboxNoticeCopy}>Your link is on its way.</p>
            </div>
          </div>
        )}
        {(state === "new" || state === "expired") && (
          <div className={styles.status}>
            <p style={{ margin: 0 }}>Ready to get started?</p>
            <Link
              className={styles.textLink}
              href="/onboarding"
              onClick={() => sessionStorage.setItem("bulletin:onboarding-prefill-email", email.trim())}
            >
              Create my briefing
            </Link>
          </div>
        )}
        {message && <p className={styles.error} role="alert">{message}</p>}
      </div>
    </>
  );
}
