import { describe, expect, it } from "vitest";

import {
  createInitialDraft,
  parseStoredDraft,
  serializeDraft,
  validateCompleteDraft,
  validateStep,
  type OnboardingDraft,
} from "@/lib/onboarding/draft";

const completeDraft: OnboardingDraft = {
  ...createInitialDraft(),
  name: "Reader One",
  email: "READER@example.com",
  stateRegion: "Karnataka",
  city: "Bengaluru",
  categories: ["india", "technology-ai"],
  storyCount: 4,
  customTopics: ["Space policy"],
  excludedTopics: ["Celebrity gossip"],
  consent: true,
};

describe("onboarding draft behavior", () => {
  it("starts with the confirmed product defaults and unchecked consent", () => {
    const draft = createInitialDraft("Asia/Kolkata");

    expect(draft.countryCode).toBe("IN");
    expect(draft.language).toBe("en");
    expect(draft.storyCount).toBe(3);
    expect(draft.theme).toBe("light-editorial");
    expect(draft.consent).toBe(false);
  });

  it("returns step-aware, field-specific errors", () => {
    const aboutErrors = validateStep(1, createInitialDraft());
    const interestErrors = validateStep(3, createInitialDraft());

    expect(aboutErrors).toMatchObject({
      name: "Enter your name.",
      email: "Enter your email address.",
    });
    expect(interestErrors.categories).toBe("Select at least one category.");
  });

  it("reserves the invalid email message for non-empty invalid input", () => {
    const errors = validateStep(1, {
      ...createInitialDraft(),
      name: "Reader One",
      email: "not-an-email",
    });

    expect(errors.email).toBe("Enter a valid email address.");
  });

  it("requires a weekly day only when weekly is selected", () => {
    const weekly = { ...completeDraft, frequency: "weekly" as const };
    const weekdays = { ...completeDraft, frequency: "weekdays" as const };

    expect(validateStep(4, weekly).weeklyDay).toBe("Choose a delivery day.");
    expect(validateStep(4, weekdays).weeklyDay).toBeUndefined();
  });

  it("requires a maintained Indian state or union territory", () => {
    const result = validateStep(2, {
      ...completeDraft,
      stateRegion: "Not a real Indian region",
    });

    expect(result.stateRegion).toBe(
      "Choose an Indian state or union territory from the list.",
    );
    expect(
      validateStep(2, { ...completeDraft, stateRegion: "kerala" }).stateRegion,
    ).toBeUndefined();
  });

  it("round-trips only a valid versioned current-tab draft", () => {
    const serialized = serializeDraft(4, completeDraft);
    const restored = parseStoredDraft(serialized);

    expect(restored?.step).toBe(4);
    expect(restored?.draft.email).toBe("READER@example.com");
    expect(parseStoredDraft("not json")).toBeNull();
    expect(
      parseStoredDraft(
        JSON.stringify({ version: 99, step: 4, draft: completeDraft }),
      ),
    ).toBeNull();
  });

  it("uses the shared subscriber validator for final normalization", () => {
    const result = validateCompleteDraft(completeDraft);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe("reader@example.com");
      expect(result.data.customTopics).toEqual(["space policy"]);
    }
  });

  it("preserves all choices when final consent is missing", () => {
    const result = validateCompleteDraft({ ...completeDraft, consent: false });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.consent).toBe(
        "Agree to receive your Bulletin before continuing.",
      );
    }
  });
});
