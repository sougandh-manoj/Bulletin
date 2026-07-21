import type { NewsCategory } from "@/config/product";

const COUNTRY_CODES = `AF AX AL DZ AS AD AO AI AQ AG AR AM AW AU AT AZ BS BH BD BB BY BE BZ BJ BM BT BO BQ BA BW BV BR IO BN BG BF BI CV KH CM CA KY CF TD CL CN CX CC CO KM CG CD CK CR CI HR CU CW CY CZ DK DJ DM DO EC EG SV GQ ER EE SZ ET FK FO FJ FI FR GF PF TF GA GM GE DE GH GI GR GL GD GP GU GT GG GN GW GY HT HM VA HN HK HU IS IN ID IR IQ IE IM IL IT JM JP JE JO KZ KE KI KP KR KW KG LA LV LB LS LR LY LI LT LU MO MG MW MY MV ML MT MH MQ MR MU YT MX FM MD MC MN ME MS MA MZ MM NA NR NP NL NC NZ NI NE NG NU NF MK MP NO OM PK PW PS PA PG PY PE PH PN PL PT PR QA RE RO RU RW BL SH KN LC MF PM VC WS SM ST SA SN RS SC SL SG SX SK SI SB SO ZA GS SS ES LK SD SR SJ SE CH SY TW TJ TZ TH TL TG TK TO TT TN TR TM TC TV UG UA AE GB US UM UY UZ VU VE VN VG VI WF EH YE ZM ZW`.split(
  " ",
);

const FALLBACK_COUNTRY_NAMES: Record<string, string> = {
  IN: "India",
  US: "United States",
  GB: "United Kingdom",
  AE: "United Arab Emirates",
  SG: "Singapore",
  AU: "Australia",
  CA: "Canada",
};

export type CountryOption = {
  code: string;
  name: string;
  label: string;
};

export function getCountryOptions(): CountryOption[] {
  const displayNames =
    typeof Intl.DisplayNames === "function"
      ? new Intl.DisplayNames(["en"], { type: "region" })
      : null;

  return COUNTRY_CODES.map((code) => {
    const name = displayNames?.of(code) ?? FALLBACK_COUNTRY_NAMES[code] ?? code;
    return {
      code,
      name,
      label: code === "IN" ? `🇮🇳 ${name}` : name,
    };
  }).sort((a, b) => {
    if (a.code === "IN") return -1;
    if (b.code === "IN") return 1;
    return a.name.localeCompare(b.name);
  });
}

const FALLBACK_TIMEZONES = [
  "Asia/Kolkata",
  "Asia/Dubai",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Europe/London",
  "Europe/Paris",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Australia/Sydney",
  "Pacific/Auckland",
];

export function getTimezoneOptions() {
  try {
    return Intl.supportedValuesOf("timeZone");
  } catch {
    return FALLBACK_TIMEZONES;
  }
}

export const FREQUENCY_DESCRIPTIONS = {
  daily: "Every day",
  weekdays: "Monday to Friday",
  weekends: "Saturday and Sunday",
  weekly: "Once on your chosen day",
} as const;

export const STEP_CONTENT = [
  {
    eyebrow: "About you",
    heading: "Let’s make this yours.",
    description:
      "Tell us where to send your briefing. You’ll confirm your email before delivery begins.",
    note: "Your email is used only to deliver and manage your Bulletin.",
  },
  {
    eyebrow: "Place & language",
    heading: "Where should your Bulletin look?",
    description:
      "Location helps us balance national, state, and local relevance.",
    note: "National stories come first, followed by state and city relevance.",
  },
  {
    eyebrow: "Your interests",
    heading: "What deserves your attention?",
    description:
      "Choose the subjects you want Bulletin to prioritize. Select up to eight.",
    note: "You can be specific without giving up the broader picture.",
  },
  {
    eyebrow: "Your routine",
    heading: "Set your rhythm.",
    description:
      "Choose how much news you want and exactly when it should arrive.",
    note: "Fewer meaningful stories will always beat a briefing padded with filler.",
  },
  {
    eyebrow: "Final review",
    heading: "Your Bulletin, at a glance.",
    description: "Review your choices before we prepare your briefing.",
    note: "Nothing starts until you confirm your email in the secure delivery flow.",
  },
] as const;

export const CATEGORY_TONE: Partial<Record<NewsCategory, "wide" | "quiet">> = {
  "regional-local": "wide",
  "business-economy": "wide",
  "markets-personal-finance": "wide",
  "technology-ai": "wide",
  "education-careers": "wide",
  "government-schemes": "wide",
};
