import { z } from "zod";

import {
  BRIEFING_THEMES,
  DELIVERY_FREQUENCIES,
  getCanonicalIndianRegion,
  INDIAN_REGIONS,
  NEWS_CATEGORIES,
  PRODUCT,
  storyCountRange,
  SUPPORTED_LANGUAGES,
  WEEKDAYS,
} from "@/config/product";

const distinctTrimmedTopics = (maximum: number) =>
  z
    .array(
      z
        .string()
        .trim()
        .min(1, "Enter a topic before adding it.")
        .max(80, "Keep each topic to 80 characters or fewer."),
    )
    .max(maximum, `You can add up to ${maximum} topics.`)
    .transform((topics) => [
      ...new Set(topics.map((topic) => topic.toLocaleLowerCase())),
    ]);

const timezoneSchema = z.string().trim().min(1).refine(
  (timezone) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: timezone });
      return true;
    } catch {
      return false;
    }
  },
  { message: "Choose a valid IANA timezone, such as Asia/Kolkata." },
);

export const subscriberPreferencesBaseSchema = z.object({
    name: z
      .string()
      .trim()
      .min(1, "Enter your name.")
      .max(100, "Keep your name to 100 characters or fewer."),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .min(1, "Enter your email address.")
      .email("Enter a valid email address.")
      .max(254, "Enter an email address with 254 characters or fewer."),
    countryCode: z
      .string()
      .trim()
      .toUpperCase()
      .length(2, "Choose a country."),
    stateRegion: z
      .string()
      .trim()
      .min(1, "Choose your state or region.")
      .max(100, "Keep your state or region to 100 characters or fewer.")
      .transform((region) => getCanonicalIndianRegion(region) ?? region),
    city: z
      .string()
      .trim()
      .max(100, "Keep your city to 100 characters or fewer.")
      .optional(),
    language: z.enum(SUPPORTED_LANGUAGES),
    categories: z
      .array(z.enum(NEWS_CATEGORIES))
      .min(PRODUCT.limits.categories.min, "Select at least one category.")
      .max(
        PRODUCT.limits.categories.max,
        `You can select up to ${PRODUCT.limits.categories.max} categories.`,
      )
      .refine((categories) => new Set(categories).size === categories.length, {
        message: "Choose each category only once.",
      }),
    customTopics: distinctTrimmedTopics(PRODUCT.limits.customTopics),
    excludedTopics: distinctTrimmedTopics(PRODUCT.limits.excludedTopics),
    storyCount: z
      .number()
      .int()
      .min(PRODUCT.limits.stories.min, "Choose at least four stories.")
      .max(PRODUCT.limits.stories.max, "Choose no more than 32 stories."),
    frequency: z.enum(DELIVERY_FREQUENCIES),
    weeklyDay: z.enum(WEEKDAYS).optional(),
    deliveryTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, {
      message: "Use a 24-hour local time in HH:mm format.",
    }),
    timezone: timezoneSchema,
    theme: z.enum(BRIEFING_THEMES),
    consent: z.literal(true),
  });

export const subscriberPreferencesSchema = subscriberPreferencesBaseSchema
  .superRefine((preferences, context) => {
    const storyRange = storyCountRange(preferences.categories.length);
    if (preferences.storyCount < storyRange.min || preferences.storyCount > storyRange.max) {
      context.addIssue({
        code: "custom",
        path: ["storyCount"],
        message: `Choose ${storyRange.min} stories so every selected category gets four.`,
      });
    }
    if (
      preferences.countryCode === "IN" &&
      !INDIAN_REGIONS.some((region) => region === preferences.stateRegion)
    ) {
      context.addIssue({
        code: "custom",
        path: ["stateRegion"],
        message: "Choose an Indian state or union territory from the list.",
      });
    }

    if (preferences.frequency === "weekly" && !preferences.weeklyDay) {
      context.addIssue({
        code: "custom",
        path: ["weeklyDay"],
        message: "Choose a delivery day for a weekly briefing.",
      });
    }

    if (preferences.frequency !== "weekly" && preferences.weeklyDay) {
      context.addIssue({
        code: "custom",
        path: ["weeklyDay"],
        message: "A delivery day is only used for weekly briefings.",
      });
    }
  });

export const subscriberStepSchemas = {
  about: subscriberPreferencesBaseSchema.pick({ name: true, email: true }),
  location: subscriberPreferencesBaseSchema.pick({
    countryCode: true,
    stateRegion: true,
    city: true,
    language: true,
    timezone: true,
  }).superRefine((preferences, context) => {
    if (
      preferences.countryCode === "IN" &&
      !INDIAN_REGIONS.some((region) => region === preferences.stateRegion)
    ) {
      context.addIssue({
        code: "custom",
        path: ["stateRegion"],
        message: "Choose an Indian state or union territory from the list.",
      });
    }
  }),
  interests: subscriberPreferencesBaseSchema.pick({
    categories: true,
    customTopics: true,
    excludedTopics: true,
  }),
  delivery: subscriberPreferencesBaseSchema
    .pick({
      storyCount: true,
      frequency: true,
      weeklyDay: true,
      deliveryTime: true,
    })
    .superRefine((preferences, context) => {
      if (preferences.frequency === "weekly" && !preferences.weeklyDay) {
        context.addIssue({
          code: "custom",
          path: ["weeklyDay"],
          message: "Choose a delivery day.",
        });
      }
    }),
  consent: z.object({ consent: z.literal(true) }),
} as const;

export const subscriberEmailSchema = subscriberPreferencesBaseSchema.pick({
  email: true,
});

export const managedPreferencesSchema = subscriberPreferencesBaseSchema
  .omit({ email: true, consent: true })
  .strict()
  .superRefine((preferences, context) => {
    const storyRange = storyCountRange(preferences.categories.length);
    if (preferences.storyCount < storyRange.min || preferences.storyCount > storyRange.max) {
      context.addIssue({
        code: "custom",
        path: ["storyCount"],
        message: `Choose ${storyRange.min} stories so every selected category gets four.`,
      });
    }
    if (
      preferences.countryCode === "IN" &&
      !INDIAN_REGIONS.some((region) => region === preferences.stateRegion)
    ) {
      context.addIssue({
        code: "custom",
        path: ["stateRegion"],
        message: "Choose an Indian state or union territory from the list.",
      });
    }

    if (preferences.frequency === "weekly" && !preferences.weeklyDay) {
      context.addIssue({
        code: "custom",
        path: ["weeklyDay"],
        message: "Choose a delivery day for a weekly briefing.",
      });
    }

    if (preferences.frequency !== "weekly" && preferences.weeklyDay) {
      context.addIssue({
        code: "custom",
        path: ["weeklyDay"],
        message: "A delivery day is only used for weekly briefings.",
      });
    }
  });

export const briefingThemeSchema = z.object({
  theme: z.enum(BRIEFING_THEMES),
  expectedVersion: z.number().int().min(1),
});

export type SubscriberPreferences = z.infer<typeof subscriberPreferencesSchema>;
export type ManagedPreferences = z.infer<typeof managedPreferencesSchema>;
