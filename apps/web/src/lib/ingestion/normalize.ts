import { createHash } from "node:crypto";

import type {
  ArticleNormalizationResult,
  BulletinLanguage,
  IngestionSource,
  ParsedFeedEntry,
} from "@/lib/ingestion/types";

export const NORMALIZATION_VERSION = "phase-6-v1" as const;
// Bulletin is a fresh-news briefing, not a historical archive. A 48-hour
// buffer covers delayed feeds and daily schedules without importing backlogs.
export const MAX_ARTICLE_AGE_MS = 48 * 60 * 60 * 1000;
export const MAX_FUTURE_SKEW_MS = 10 * 60 * 1000;

const TRACKING_PARAMETER = /^(?:utm_.+|fbclid|gclid|dclid|msclkid|mc_cid|mc_eid|igshid|vero_conv|vero_id|_hsenc|_hsmi|mkt_tok|campaign_id|adgroupid)$/i;
const LEADING_NEWS_LABEL = /^(?:(?:breaking(?:\s+news)?|live(?:\s+updates?)?|update)|(?:ब्रेकिंग\s+न्यूज़|लाइव\s+अपडेट)|(?:ബ്രേക്കിംഗ്\s+ന്യൂസ്|ലൈവ്\s+അപ്‌ഡേറ്റ്))\s*[:|—–-]\s*/iu;
const TAG = /<[^>]*>/g;
const CONTROL_CHARACTER = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

const LANGUAGE_ALIASES: Record<string, BulletinLanguage> = {
  en: "en",
  eng: "en",
  "en-in": "en",
  "en-gb": "en",
  "en-us": "en",
  hi: "hi",
  hin: "hi",
  "hi-in": "hi",
  ml: "ml",
  mal: "ml",
  "ml-in": "ml",
};

export function stableHash(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function normalizeWhitespace(value: string): string {
  return value
    .normalize("NFKC")
    .replace(CONTROL_CHARACTER, "")
    .replace(/\p{White_Space}+/gu, " ")
    .trim();
}

function normalizeComparisonPunctuation(value: string): string {
  return value
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/[‐‑‒–—―]/g, "-")
    .replace(/…/g, "...")
    .replace(/\s*([:;,.!?|/()\[\]{}-])\s*/g, "$1")
    .replace(/[-|:]+$/g, "");
}

function escapeRegularExpression(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function normalizePublisherName(value: string): string {
  return normalizeWhitespace(value).replace(/\s+([.,])/g, "$1");
}

export function normalizeTitle(title: string, publisherName?: string): string {
  let normalized = normalizeWhitespace(title).replace(LEADING_NEWS_LABEL, "");
  if (publisherName) {
    const publisher = escapeRegularExpression(normalizePublisherName(publisherName));
    normalized = normalized.replace(
      new RegExp(`\\s*(?:[-|—–:]\\s*)${publisher}$`, "iu"),
      "",
    );
  }
  return normalizeComparisonPunctuation(normalized)
    .toLocaleLowerCase("und")
    .trim();
}

export function canonicalizeUrl(value: string): string {
  const url = new URL(normalizeWhitespace(value));
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new TypeError("Article URL must use HTTP or HTTPS");
  }
  if (url.username || url.password) {
    throw new TypeError("Article URL must not contain credentials");
  }

  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (TRACKING_PARAMETER.test(key)) url.searchParams.delete(key);
  }

  const sortedParameters = [...url.searchParams.entries()].sort(([leftKey, leftValue], [rightKey, rightValue]) =>
    leftKey === rightKey
      ? leftValue.localeCompare(rightValue, "en")
      : leftKey.localeCompare(rightKey, "en"),
  );
  url.search = "";
  for (const [key, parameterValue] of sortedParameters) {
    url.searchParams.append(key, parameterValue);
  }

  return url.toString();
}

function decodeBasicEntities(value: string): string {
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
  };
  return value.replace(/&(#(?:x[0-9a-f]+|[0-9]+)|amp|apos|gt|lt|nbsp|quot);/gi, (entity, name: string) => {
    if (!name.startsWith("#")) return named[name.toLowerCase()] ?? entity;
    const hexadecimal = name[1]?.toLowerCase() === "x";
    const codePoint = Number.parseInt(name.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10);
    if (!Number.isInteger(codePoint) || codePoint <= 0 || codePoint > 0x10ffff) return "";
    return String.fromCodePoint(codePoint);
  });
}

export function normalizeDescription(value: string | null): string | null {
  if (!value) return null;
  const normalized = normalizeWhitespace(
    decodeBasicEntities(value.replace(TAG, " ")),
  );
  return normalized ? normalized.slice(0, 8_000) : null;
}

export function normalizeLanguage(
  entryLanguage: string | null,
  feedLanguage: string | null,
  sourceLanguage: BulletinLanguage,
): { language: BulletinLanguage; source: "entry" | "feed" | "source" } {
  const entry = entryLanguage
    ? LANGUAGE_ALIASES[normalizeWhitespace(entryLanguage).toLowerCase()]
    : undefined;
  if (entry) return { language: entry, source: "entry" };
  const feed = feedLanguage
    ? LANGUAGE_ALIASES[normalizeWhitespace(feedLanguage).toLowerCase()]
    : undefined;
  if (feed) return { language: feed, source: "feed" };
  return { language: sourceLanguage, source: "source" };
}

export function normalizeCountryCode(value: string | null): string | null {
  if (!value) return null;
  const countryCode = normalizeWhitespace(value).toUpperCase();
  return /^[A-Z]{2}$/.test(countryCode) ? countryCode : null;
}

export function normalizeGeographyLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = normalizeWhitespace(value);
  return normalized || null;
}

function normalizeCategories(values: string[]): string[] {
  return [...new Set(values
    .map((value) => normalizeWhitespace(value).toLocaleLowerCase("und"))
    .filter(Boolean))]
    .sort((left, right) => left.localeCompare(right, "en"))
    .slice(0, 50);
}

function parseTimestamp(value: string | null): number | null {
  if (!value) return null;
  const parsed = Date.parse(normalizeWhitespace(value));
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeArticleEntry(input: {
  entry: ParsedFeedEntry;
  feedLanguage: string | null;
  source: IngestionSource;
  now?: Date;
}): ArticleNormalizationResult {
  const { entry, feedLanguage, source } = input;
  const now = input.now ?? new Date();
  const originalTitle = entry.title ? normalizeWhitespace(entry.title) : "";
  if (!originalTitle) return { ok: false, reason: "missing-title" };
  if (!entry.url) return { ok: false, reason: "missing-url" };

  let canonicalUrl: string;
  try {
    canonicalUrl = canonicalizeUrl(entry.url);
  } catch {
    return { ok: false, reason: "invalid-url" };
  }

  const publishedTimestamp = parseTimestamp(entry.published);
  const updatedTimestamp = parseTimestamp(entry.updated);
  if (!entry.published && !entry.updated) return { ok: false, reason: "missing-timestamp" };
  const timestamp = publishedTimestamp ?? updatedTimestamp;
  if (timestamp === null) return { ok: false, reason: "invalid-timestamp" };
  if (timestamp < now.getTime() - MAX_ARTICLE_AGE_MS) return { ok: false, reason: "stale-timestamp" };
  if (timestamp > now.getTime() + MAX_FUTURE_SKEW_MS) return { ok: false, reason: "future-timestamp" };

  const normalizedTitle = normalizeTitle(originalTitle, source.publisherName);
  const normalizedLanguage = normalizeLanguage(entry.language, feedLanguage, source.language);
  const feedUpdatedTimestamp = parseTimestamp(entry.updated);
  const publisherName = normalizePublisherName(source.publisherName);

  return {
    ok: true,
    article: {
      sourceId: source.id,
      publisherName,
      originalTitle,
      normalizedTitle,
      originalUrl: normalizeWhitespace(entry.url),
      canonicalUrl,
      canonicalUrlHash: stableHash(canonicalUrl),
      normalizedTitleHash: stableHash(normalizedTitle),
      description: normalizeDescription(entry.description),
      author: entry.author ? normalizeWhitespace(entry.author).slice(0, 500) || null : null,
      publishedAt: new Date(timestamp).toISOString(),
      feedUpdatedAt: feedUpdatedTimestamp === null ? null : new Date(feedUpdatedTimestamp).toISOString(),
      timestampSource: publishedTimestamp === null ? "updated" : "published",
      declaredLanguage: normalizedLanguage.language,
      languageSource: normalizedLanguage.source,
      countryCode: normalizeCountryCode(source.countryCode),
      stateRegion: normalizeGeographyLabel(source.stateRegion),
      city: normalizeGeographyLabel(source.city),
      geographySource: "source",
      feedCategories: normalizeCategories([...source.categoryScope, ...entry.categories]),
      feedEntryId: entry.guid ? normalizeWhitespace(entry.guid).slice(0, 2_000) || null : null,
      rawMetadata: entry.raw,
      normalizationVersion: NORMALIZATION_VERSION,
    },
  };
}
