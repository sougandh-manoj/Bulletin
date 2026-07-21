import type { Metadata } from "next";

import OnboardingFlow from "./onboarding-flow";

export const metadata: Metadata = {
  title: "Create your briefing",
  description:
    "Choose the interests, location, language and schedule for your personal Bulletin.",
};

export default function OnboardingPage() {
  return <OnboardingFlow />;
}
