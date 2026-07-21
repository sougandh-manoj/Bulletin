export type BulletinLanguage = "en" | "hi" | "ml";

export type ParsedFeedEntry = {
  title: string | null;
  url: string | null;
  guid: string | null;
  description: string | null;
  author: string | null;
  published: string | null;
  updated: string | null;
  language: string | null;
  categories: string[];
  raw: Record<string, unknown>;
};

export type ParsedFeed = {
  format: "rss-1.0" | "rss-2.0" | "atom";
  title: string | null;
  language: string | null;
  entries: ParsedFeedEntry[];
};

export type IngestionSource = {
  id: string;
  publisherName: string;
  language: BulletinLanguage;
  countryCode: string | null;
  stateRegion: string | null;
  city?: string | null;
  categoryScope: string[];
};

export type NormalizedArticle = {
  sourceId: string;
  publisherName: string;
  originalTitle: string;
  normalizedTitle: string;
  originalUrl: string;
  canonicalUrl: string;
  canonicalUrlHash: string;
  normalizedTitleHash: string;
  description: string | null;
  author: string | null;
  publishedAt: string;
  feedUpdatedAt: string | null;
  timestampSource: "published" | "updated";
  declaredLanguage: BulletinLanguage;
  languageSource: "entry" | "feed" | "source";
  countryCode: string | null;
  stateRegion: string | null;
  city: string | null;
  geographySource: "source";
  feedCategories: string[];
  feedEntryId: string | null;
  rawMetadata: Record<string, unknown>;
  normalizationVersion: "phase-6-v1";
};

export type ArticleNormalizationResult =
  | { ok: true; article: NormalizedArticle }
  | {
      ok: false;
      reason:
        | "missing-title"
        | "missing-url"
        | "invalid-url"
        | "missing-timestamp"
        | "invalid-timestamp"
        | "stale-timestamp"
        | "future-timestamp";
    };

