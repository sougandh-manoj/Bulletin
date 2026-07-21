export const SUPPORTED_LANGUAGES = ["en", "hi", "ml"] as const;
export const BRIEFING_THEMES = [
  "light-editorial",
  "dark-intelligence",
  "midnight-brief",
  "amber-brief",
] as const;
export const DELIVERY_FREQUENCIES = [
  "daily",
  "weekdays",
  "weekends",
  "weekly",
] as const;
export const WEEKDAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

export const NEWS_CATEGORIES = [
  "india",
  "world",
  "regional-local",
  "politics",
  "business-economy",
  "markets-personal-finance",
  "startups",
  "technology-ai",
  "science",
  "health",
  "education-careers",
  "government-schemes",
  "sports",
  "entertainment",
  "climate",
] as const;

export const PUBLIC_ROUTES = {
  home: "/",
  onboarding: "/onboarding",
  manageAccess: "/manage/access",
} as const;

export const INDIAN_REGIONS = [
  "Andaman and Nicobar Islands",
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chandigarh",
  "Chhattisgarh",
  "Dadra and Nagar Haveli and Daman and Diu",
  "Delhi",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jammu and Kashmir",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Ladakh",
  "Lakshadweep",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Puducherry",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
] as const;

export function getCanonicalIndianRegion(value: string) {
  const normalizedValue = value.trim().toLocaleLowerCase("en-IN");
  return INDIAN_REGIONS.find(
    (region) => region.toLocaleLowerCase("en-IN") === normalizedValue,
  );
}

export const LANGUAGE_LABELS = {
  en: "English",
  hi: "Hindi",
  ml: "Malayalam",
} as const satisfies Record<SupportedLanguage, string>;

export const NEWS_CATEGORY_LABELS = {
  india: "India",
  world: "World",
  "regional-local": "Regional & Local",
  politics: "Politics",
  "business-economy": "Business & Economy",
  "markets-personal-finance": "Markets & Personal Finance",
  startups: "Startups",
  "technology-ai": "Technology & AI",
  science: "Science",
  health: "Health",
  "education-careers": "Education & Careers",
  "government-schemes": "Government Schemes",
  sports: "Sports",
  entertainment: "Entertainment",
  climate: "Climate",
} as const satisfies Record<NewsCategory, string>;

export const DELIVERY_FREQUENCY_LABELS = {
  daily: "Daily",
  weekdays: "Weekdays",
  weekends: "Weekends",
  weekly: "Weekly",
} as const satisfies Record<DeliveryFrequency, string>;

export const WEEKDAY_LABELS = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
} as const satisfies Record<Weekday, string>;

export const PRODUCT = {
  name: "Bulletin",
  promise: "Stay informed without surrendering your time and attention.",
  description:
    "A small, trustworthy and concise news briefing, delivered at the exact schedule each subscriber chooses.",
  landing: {
    title: "The news you need. Nothing you don’t.",
    description:
      "A concise, personalised email news briefing shaped around your interests, location, language, and schedule.",
  },
  defaultCountryCode: "IN",
  defaultLanguage: "en",
  defaultTheme: "light-editorial",
  defaultStoryCount: 3,
  defaultFrequency: "weekdays",
  defaultDeliveryTime: "08:00",
  limits: {
    categories: { min: 1, max: 8 },
    customTopics: 5,
    excludedTopics: 5,
    stories: { min: 3, max: 32, perCategoryMin: 3, perCategoryMax: 4 },
  },
  consentVersion: "2026-07-12",
} as const;

export function storyCountRange(categoryCount: number) {
  const count = Math.max(PRODUCT.limits.categories.min, categoryCount);
  return {
    min: Math.min(PRODUCT.limits.stories.max, count * PRODUCT.limits.stories.perCategoryMin),
    max: Math.min(PRODUCT.limits.stories.max, count * PRODUCT.limits.stories.perCategoryMax),
  };
}

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];
export type BriefingTheme = (typeof BRIEFING_THEMES)[number];
export type DeliveryFrequency = (typeof DELIVERY_FREQUENCIES)[number];
export type Weekday = (typeof WEEKDAYS)[number];
export type NewsCategory = (typeof NEWS_CATEGORIES)[number];

export const BRIEFING_THEME_LABELS = {
  "light-editorial": "Light Editorial",
  "dark-intelligence": "Signal Brief",
  "midnight-brief": "Midnight Brief",
  "amber-brief": "Amber Brief",
} as const satisfies Record<BriefingTheme, string>;
