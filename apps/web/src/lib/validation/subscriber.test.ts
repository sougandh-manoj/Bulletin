import { describe, expect, it } from "vitest";

import {
  briefingThemeSchema,
  managedPreferencesSchema,
  subscriberPreferencesSchema,
} from "@/lib/validation/subscriber";

const validPreferences = {
  name: "Test Subscriber",
  email: "TEST@example.com",
  countryCode: "in",
  stateRegion: "kerala",
  city: "Bengaluru",
  language: "en",
  categories: ["india", "technology-ai"],
  customTopics: ["Space policy"],
  excludedTopics: ["Celebrity gossip"],
  storyCount: 4,
  frequency: "daily",
  deliveryTime: "07:30",
  timezone: "Asia/Kolkata",
  theme: "light-editorial",
  consent: true,
} as const;

describe("subscriber preference validation", () => {
  it.each(["midnight-brief", "amber-brief"] as const)("accepts the %s theme", (theme) => {
    expect(briefingThemeSchema.safeParse({
      theme,
      expectedVersion: 1,
    }).success).toBe(true);
  });

  it("normalizes safe comparison fields", () => {
    const result = subscriberPreferencesSchema.parse(validPreferences);

    expect(result.email).toBe("test@example.com");
    expect(result.countryCode).toBe("IN");
    expect(result.stateRegion).toBe("Kerala");
    expect(result.customTopics).toEqual(["space policy"]);
  });

  it("requires a weekday only for weekly delivery", () => {
    const missingDay = subscriberPreferencesSchema.safeParse({
      ...validPreferences,
      frequency: "weekly",
    });
    const unnecessaryDay = subscriberPreferencesSchema.safeParse({
      ...validPreferences,
      weeklyDay: "monday",
    });

    expect(missingDay.success).toBe(false);
    expect(unnecessaryDay.success).toBe(false);
  });

  it("rejects duplicate categories and invalid timezones", () => {
    const result = subscriberPreferencesSchema.safeParse({
      ...validPreferences,
      categories: ["india", "india"],
      timezone: "Not/A_Timezone",
    });

    expect(result.success).toBe(false);
  });
});

describe("managed preference validation", () => {
  const managed = {
    name: "Reader",
    countryCode: "IN",
    stateRegion: "Kerala",
    city: "Kochi",
    language: "en" as const,
    categories: ["india"] as const,
    customTopics: [] as string[],
    excludedTopics: [] as string[],
    storyCount: 3,
    frequency: "daily" as const,
    deliveryTime: "08:00",
    timezone: "Asia/Kolkata",
    theme: "light-editorial" as const,
  };

  it("validates the complete editable state without accepting an email field", () => {
    expect(managedPreferencesSchema.safeParse(managed).success).toBe(true);
    expect(managedPreferencesSchema.safeParse({ ...managed, email: "changed@example.com" }).success).toBe(false);
  });

  it("keeps weekly-day and category boundaries server-enforced", () => {
    expect(managedPreferencesSchema.safeParse({ ...managed, frequency: "weekly" }).success).toBe(false);
    expect(managedPreferencesSchema.safeParse({ ...managed, categories: [] }).success).toBe(false);
  });
});
