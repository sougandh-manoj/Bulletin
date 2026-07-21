import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  canonicalizeUrl,
  normalizeArticleEntry,
  normalizeLanguage,
  normalizePublisherName,
  normalizeTitle,
  normalizeWhitespace,
  stableHash,
} from "@/lib/ingestion/normalize";
import { parseFeed } from "@/lib/ingestion/parse-feed";
import type { IngestionSource, ParsedFeedEntry } from "@/lib/ingestion/types";

const source: IngestionSource = {
  id: "source-1",
  publisherName: "Fixture News",
  language: "en",
  countryCode: "in",
  stateRegion: " Kerala ",
  city: " Kochi ",
  categoryScope: ["business-economy"],
};

const fixtureUrl = (name: string) => new URL(`./fixtures/${name}`, import.meta.url);

function entry(overrides: Partial<ParsedFeedEntry> = {}): ParsedFeedEntry {
  return {
    title: "A valid fixture title",
    url: "https://publisher.example/story",
    guid: "fixture-guid",
    description: null,
    author: null,
    published: "2026-07-18T05:00:00Z",
    updated: null,
    language: null,
    categories: [],
    raw: {},
    ...overrides,
  };
}

describe("deterministic article normalization", () => {
  it("normalizes Unicode whitespace, punctuation, publisher names, and title labels", () => {
    expect(normalizeWhitespace("  Kerala\u00a0\t News  ")).toBe("Kerala News");
    expect(normalizePublisherName("  Fixture\u00a0 News ")).toBe("Fixture News");
    expect(normalizeTitle("Breaking News: RBI keeps “policy” rate — Fixture News", "Fixture News"))
      .toBe('rbi keeps "policy" rate');
  });

  it("canonicalizes URL parameters without changing meaningful path or query data", () => {
    expect(canonicalizeUrl("HTTPS://Publisher.Example:443/Story?utm_source=rss&b=2&a=3&a=1#section"))
      .toBe("https://publisher.example/Story?a=1&a=3&b=2");
    expect(() => canonicalizeUrl("javascript:alert(1)")).toThrow(TypeError);
    expect(() => canonicalizeUrl("https://user:pass@example.com/story")).toThrow(TypeError);
  });

  it("uses source identity rather than untrusted feed publisher claims", async () => {
    const feed = parseFeed(await readFile(fixtureUrl("rss-2.xml"), "utf8"));
    const result = normalizeArticleEntry({
      entry: feed.entries[0],
      feedLanguage: feed.language,
      source,
      now: new Date("2026-07-18T06:00:00Z"),
    });
    expect(result).toMatchObject({ ok: true });
    if (!result.ok) return;
    expect(result.article).toMatchObject({
      publisherName: "Fixture News",
      canonicalUrl: "https://publisher.example/policy?a=1&b=2",
      declaredLanguage: "en",
      languageSource: "feed",
      countryCode: "IN",
      stateRegion: "Kerala",
      city: "Kochi",
      description: "A fixture description & context.",
      feedCategories: ["business", "business-economy", "policy"],
      timestampSource: "published",
    });
    expect(result.article.canonicalUrlHash).toBe(stableHash(result.article.canonicalUrl));
    expect(result.article.normalizedTitleHash).toBe(stableHash(result.article.normalizedTitle));
  });

  it("normalizes supported language aliases with deterministic precedence", () => {
    expect(normalizeLanguage("ml-IN", "en", "hi")).toEqual({ language: "ml", source: "entry" });
    expect(normalizeLanguage("unknown", "hi-IN", "en")).toEqual({ language: "hi", source: "feed" });
    expect(normalizeLanguage(null, null, "en")).toEqual({ language: "en", source: "source" });
  });

  it("reports missing, malformed, stale, and future timestamps instead of guessing", () => {
    const now = new Date("2026-07-18T06:00:00Z");
    expect(normalizeArticleEntry({ entry: entry({ published: null }), feedLanguage: null, source, now }))
      .toEqual({ ok: false, reason: "missing-timestamp" });
    expect(normalizeArticleEntry({ entry: entry({ published: "not-a-date" }), feedLanguage: null, source, now }))
      .toEqual({ ok: false, reason: "invalid-timestamp" });
    expect(normalizeArticleEntry({ entry: entry({ published: "2026-01-01T00:00:00Z" }), feedLanguage: null, source, now }))
      .toEqual({ ok: false, reason: "stale-timestamp" });
    expect(normalizeArticleEntry({ entry: entry({ published: "2026-07-18T06:11:00Z" }), feedLanguage: null, source, now }))
      .toEqual({ ok: false, reason: "future-timestamp" });
  });

  it("rejects missing titles and invalid or missing article URLs", () => {
    const now = new Date("2026-07-18T06:00:00Z");
    expect(normalizeArticleEntry({ entry: entry({ title: "  " }), feedLanguage: null, source, now }))
      .toEqual({ ok: false, reason: "missing-title" });
    expect(normalizeArticleEntry({ entry: entry({ url: null }), feedLanguage: null, source, now }))
      .toEqual({ ok: false, reason: "missing-url" });
    expect(normalizeArticleEntry({ entry: entry({ url: "ftp://example.com/story" }), feedLanguage: null, source, now }))
      .toEqual({ ok: false, reason: "invalid-url" });
  });
});
