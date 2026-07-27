import type { Metadata } from "next";
import { cookies } from "next/headers";

import { inspectVerificationToken } from "@/data/subscribers";
import {
  VERIFICATION_COOKIE_NAME,
} from "@/lib/security/constants";
import {
  hashValue,
  parseSessionCookie,
  toPostgresBytea,
} from "@/lib/security/crypto";

import styles from "../secure-access.module.css";
import { SecureShell } from "../secure-shell";
import VerificationThemeForm from "./verification-theme-form";

export const metadata: Metadata = { title: "Confirm email", robots: { index: false, follow: false } };

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ i?: string; state?: string; t?: string }>;
}) {
  const { i: intentParam, state, t: tokenParam } = await searchParams;
  const cookieStore = await cookies();
  const verification = parseSessionCookie(
    cookieStore.get(VERIFICATION_COOKIE_NAME)?.value,
  );
  const fallbackVerification =
    /^[A-Za-z0-9_-]{43}$/.test(tokenParam ?? "") &&
    /^[A-Za-z0-9_-]{43}$/.test(intentParam ?? "")
      ? { sessionToken: tokenParam as string, csrfToken: intentParam as string }
      : null;
  const activeVerification = verification ?? fallbackVerification;

  let valid = false;
  if (!state && activeVerification) {
    try {
      const inspection = await inspectVerificationToken(
        toPostgresBytea(hashValue(activeVerification.sessionToken)),
      );
      valid = Boolean(inspection?.is_valid);
    } catch {
      valid = false;
    }
  }

  return (
    <SecureShell>
      {valid && activeVerification ? (
        <VerificationThemeForm
          intent={activeVerification.csrfToken}
          token={verification ? undefined : fallbackVerification?.sessionToken}
        />
      ) : (
        <div className={styles.narrow}>
          <p className={styles.eyebrow}>Email link</p>
          <h1 className={styles.title}>This link needs attention.</h1>
          <p className={styles.lede}>
            {state === "limited"
              ? "Too many link checks arrived at once. Wait a little, then open the newest email again."
              : "This link is invalid, expired, already used, or replaced by a newer one."}
          </p>
          <section className={styles.card}>
            <h2>Request a fresh verification email</h2>
            <a className={styles.textLink} href="/manage/access">Request secure access</a>
          </section>
        </div>
      )}
    </SecureShell>
  );
}
