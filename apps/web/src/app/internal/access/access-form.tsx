"use client";

import { useState } from "react";

export function OwnerAccessForm() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("sending");
    try {
      const response = await fetch("/api/internal/owner/access/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setState(response.ok ? "sent" : "error");
    } catch {
      setState("error");
    }
  }
  return (
    <form onSubmit={submit} style={{ display: "grid", gap: 16 }}>
      <label htmlFor="owner-email" style={{ display: "grid", gap: 8 }}>
        Owner email
        <input
          id="owner-email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            if (state === "sent" || state === "error") setState("idle");
          }}
          style={{ padding: "12px 14px", border: "1px solid #c9c4b9", background: "#fffdf8", color: "#15191d" }}
        />
      </label>
      <button type="submit" disabled={state === "sending"} style={{ padding: "12px 16px", border: 0, background: "#15191d", color: "#fff", fontWeight: 700 }}>
        {state === "sending" ? "Sending…" : "Send one-time access link"}
      </button>
      {state === "sent" ? <p role="status">If the address is authorized, a short-lived link has been sent.</p> : null}
      {state === "error" ? <p role="alert">Access is temporarily unavailable. Please try again.</p> : null}
    </form>
  );
}
