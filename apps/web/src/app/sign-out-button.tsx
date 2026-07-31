"use client";

import { type FormEvent, useState } from "react";

export function SignOutButton({ className }: { className?: string }) {
  const [submitting, setSubmitting] = useState(false);

  async function signOut(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    try {
      const response = await fetch("/auth/sign-out", {
        method: "POST",
        credentials: "same-origin",
      });

      if (response.redirected) {
        window.location.assign(response.url);
        return;
      }

      if (response.ok) {
        window.location.assign("/");
        return;
      }
    } catch {
      // Keep the user in place so they can retry a transient network failure.
    }

    setSubmitting(false);
  }

  return (
    <form action="/auth/sign-out" method="post" onSubmit={signOut}>
      <button className={className} type="submit" disabled={submitting}>
        Log out
      </button>
    </form>
  );
}
