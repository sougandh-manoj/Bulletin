import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getAuthenticatedBulletinSubscriber, getAuthenticatedAuthUser } from "@/lib/security/authenticated-subscriber";

import secureStyles from "../secure-access.module.css";
import { SecureShell } from "../secure-shell";
import OnboardingFlow from "./onboarding-flow";

export const metadata: Metadata = {
  title: "Create your briefing",
  description:
    "Choose the interests, location, language and schedule for your personal Bulletin.",
};
export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const authenticated = await getAuthenticatedAuthUser();
  if (!authenticated) redirect("/sign-in?intent=create");

  const bulletin = await getAuthenticatedBulletinSubscriber();
  if (bulletin?.subscriber) {
    return (
      <SecureShell>
        <div className={secureStyles.narrow}>
          <p className={secureStyles.eyebrow}>Your Bulletin</p>
          <h1 className={secureStyles.title}>You already have a Bulletin.</h1>
          <p className={secureStyles.lede}>
            You can manage your existing briefing instead.
          </p>
          <section className={secureStyles.card}>
            <Link className={secureStyles.button} href="/manage">
              Manage briefing
            </Link>
          </section>
        </div>
      </SecureShell>
    );
  }

  return (
    <OnboardingFlow
      authenticatedEmail={authenticated.email}
      defaultName={authenticated.user.user_metadata?.full_name}
    />
  );
}
