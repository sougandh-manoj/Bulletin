import { z } from "zod";

import {
  DELIVERY_FREQUENCIES,
  NEWS_CATEGORIES,
  PRODUCT,
  SUPPORTED_LANGUAGES,
  WEEKDAYS,
  BRIEFING_THEMES,
  type BriefingTheme,
  type DeliveryFrequency,
  type NewsCategory,
  type SupportedLanguage,
  type Weekday,
} from "@/config/product";
import {
  subscriberPreferencesSchema,
  subscriberStepSchemas,
} from "@/lib/validation/subscriber";

export const ONBOARDING_DRAFT_KEY = "bulletin:onboarding-draft:v1";
export const ONBOARDING_DRAFT_VERSION = 1;

export type OnboardingDraft = {
  name: string;
  email: string;
  countryCode: string;
  stateRegion: string;
  city: string;
  language: SupportedLanguage;
  categories: NewsCategory[];
  customTopics: string[];
  excludedTopics: string[];
  storyCount: number;
  frequency: DeliveryFrequency;
  weeklyDay?: Weekday;
  deliveryTime: string;
  timezone: string;
  theme: BriefingTheme;
  consent: boolean;
};

export type FieldErrors = Record<string, string>;

const storedDraftSchema = z.object({
  version: z.literal(ONBOARDING_DRAFT_VERSION),
  step: z.number().int().min(1).max(5),
  draft: z.object({
    name: z.string(),
    email: z.string(),
    countryCode: z.string(),
    stateRegion: z.string(),
    city: z.string(),
    language: z.enum(SUPPORTED_LANGUAGES),
    categories: z.array(z.enum(NEWS_CATEGORIES)),
    customTopics: z.array(z.string()),
    excludedTopics: z.array(z.string()),
    storyCount: z.number(),
    frequency: z.enum(DELIVERY_FREQUENCIES),
    weeklyDay: z.enum(WEEKDAYS).optional(),
    deliveryTime: z.string(),
    timezone: z.string(),
    theme: z.enum(BRIEFING_THEMES),
    consent: z.boolean(),
  }),
});

export type StoredOnboardingDraft = z.infer<typeof storedDraftSchema>;

export function createInitialDraft(timezone = "Asia/Kolkata"): OnboardingDraft {
  return {
    name: "",
    email: "",
    countryCode: PRODUCT.defaultCountryCode,
    stateRegion: "",
    city: "",
    language: PRODUCT.defaultLanguage,
    categories: [],
    customTopics: [],
    excludedTopics: [],
    storyCount: PRODUCT.defaultStoryCount,
    frequency: PRODUCT.defaultFrequency,
    deliveryTime: PRODUCT.defaultDeliveryTime,
    timezone,
    theme: PRODUCT.defaultTheme,
    consent: false,
  };
}

function errorsFromIssues(issues: z.core.$ZodIssue[]): FieldErrors {
  return issues.reduce<FieldErrors>((errors, issue) => {
    const field = String(issue.path[0] ?? "form");
    if (errors[field]) return errors;

    if (field === "consent") {
      errors[field] = "Agree to receive your Bulletin before continuing.";
    } else {
      errors[field] = issue.message;
    }
    return errors;
  }, {});
}

export function validateStep(step: number, draft: OnboardingDraft): FieldErrors {
  const valuesByStep = {
    1: { name: draft.name, email: draft.email },
    2: {
      countryCode: draft.countryCode,
      stateRegion: draft.stateRegion,
      city: draft.city,
      language: draft.language,
      timezone: draft.timezone,
    },
    3: {
      categories: draft.categories,
      customTopics: draft.customTopics,
      excludedTopics: draft.excludedTopics,
    },
    4: {
      storyCount: draft.storyCount,
      frequency: draft.frequency,
      weeklyDay: draft.weeklyDay,
      deliveryTime: draft.deliveryTime,
    },
    5: { theme: draft.theme, consent: draft.consent },
  } as const;

  const schemas = {
    1: subscriberStepSchemas.about,
    2: subscriberStepSchemas.location,
    3: subscriberStepSchemas.interests,
    4: subscriberStepSchemas.delivery,
    5: subscriberStepSchemas.consent,
  } as const;

  const normalizedStep = Math.min(5, Math.max(1, step)) as 1 | 2 | 3 | 4 | 5;
  const result = schemas[normalizedStep].safeParse(valuesByStep[normalizedStep]);
  return result.success ? {} : errorsFromIssues(result.error.issues);
}

export function validateCompleteDraft(draft: OnboardingDraft) {
  const result = subscriberPreferencesSchema.safeParse(draft);
  return result.success
    ? { success: true as const, data: result.data, errors: {} }
    : {
        success: false as const,
        data: null,
        errors: errorsFromIssues(result.error.issues),
      };
}

export function serializeDraft(step: number, draft: OnboardingDraft) {
  return JSON.stringify({
    version: ONBOARDING_DRAFT_VERSION,
    step: Math.min(5, Math.max(1, step)),
    draft,
  });
}

export function parseStoredDraft(value: string | null): StoredOnboardingDraft | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    const result = storedDraftSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
