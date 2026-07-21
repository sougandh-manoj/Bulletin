"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import styles from "../../secure-access.module.css";

export default function DeleteForm({ csrfToken }: { csrfToken: string }) {
  const router = useRouter();
  const [confirmation, setConfirmation] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting || confirmation !== "DELETE") return;
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/secure/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csrfToken, confirmation }),
      });
      const result = await response.json() as { ok?: boolean; message?: string };
      if (!response.ok || !result.ok) {
        setError(result.message ?? "Your Bulletin was not deleted.");
        return;
      }
      router.replace("/manage/deleted");
      router.refresh();
    } catch {
      setError("Your Bulletin was not deleted. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className={styles.form} onSubmit={submit}>
      <div className={styles.field}>
        <label htmlFor="delete-confirmation">Type DELETE to confirm</label>
        <input
          id="delete-confirmation"
          value={confirmation}
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => setConfirmation(event.target.value)}
        />
      </div>
      <button className={styles.dangerButton} type="submit" disabled={submitting || confirmation !== "DELETE"}>
        {submitting ? "Deleting personal data…" : "Unsubscribe and delete my Bulletin"}
      </button>
      {error && <p className={styles.error} role="alert">{error}</p>}
    </form>
  );
}
