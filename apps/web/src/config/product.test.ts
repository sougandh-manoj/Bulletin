import { describe, expect, it } from "vitest";

import {
  BRIEFING_THEME_LABELS,
  BRIEFING_THEMES,
  getCanonicalIndianRegion,
  LANGUAGE_LABELS,
  INDIAN_REGIONS,
  NEWS_CATEGORIES,
  NEWS_CATEGORY_LABELS,
  PRODUCT,
  PUBLIC_ROUTES,
  SUPPORTED_LANGUAGES,
} from "@/config/product";

describe("product configuration", () => {
  it("keeps the confirmed default experience centralized", () => {
    expect(PRODUCT.name).toBe("Bulletin");
    expect(PRODUCT.defaultCountryCode).toBe("IN");
    expect(PRODUCT.defaultLanguage).toBe("en");
    expect(PRODUCT.defaultTheme).toBe("light-editorial");
    expect(PRODUCT.defaultStoryCount).toBe(3);
    expect(PRODUCT.defaultFrequency).toBe("weekdays");
    expect(PRODUCT.defaultDeliveryTime).toBe("08:00");
    expect(PRODUCT.landing.title).toBe("The news you need. Nothing you don’t.");
    expect(PUBLIC_ROUTES.onboarding).toBe("/onboarding");
    expect(PUBLIC_ROUTES.manageAccess).toBe("/manage/access");
  });

  it("contains the confirmed languages and all fifteen categories", () => {
    expect(SUPPORTED_LANGUAGES).toEqual(["en", "hi", "ml"]);
    expect(NEWS_CATEGORIES).toHaveLength(15);
    expect(Object.keys(LANGUAGE_LABELS)).toEqual(SUPPORTED_LANGUAGES);
    expect(Object.keys(NEWS_CATEGORY_LABELS)).toEqual(NEWS_CATEGORIES);
    expect(BRIEFING_THEMES).toEqual([
      "light-editorial",
      "dark-intelligence",
      "midnight-brief",
      "amber-brief",
    ]);
    expect(BRIEFING_THEME_LABELS["dark-intelligence"]).toBe("Signal Brief");
    expect(BRIEFING_THEME_LABELS["midnight-brief"]).toBe("Midnight Brief");
    expect(BRIEFING_THEME_LABELS["amber-brief"]).toBe("Amber Brief");
    expect(INDIAN_REGIONS).toHaveLength(36);
  });

  it("resolves Indian regions without requiring exact capitalization", () => {
    expect(getCanonicalIndianRegion("kerala")).toBe("Kerala");
    expect(getCanonicalIndianRegion("  tAmIl NaDu  ")).toBe("Tamil Nadu");
  });
});
