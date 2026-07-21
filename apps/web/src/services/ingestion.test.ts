import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ClaimedSource } from "@/data/ingestion";
import { FeedFetchError } from "@/lib/ingestion/fetch-feed";
import { runIngestionBatch } from "@/services/ingestion";

const now = new Date("2026-07-18T06:00:00Z");
const rss = (items: string) => `<?xml version="1.0"?><rss version="2.0"><channel><title>Fixture</title><language>en</language>${items}</channel></rss>`;
const item = (input: { title: string; url: string; published?: string }) => `<item><title>${input.title}</title><link>${input.url.replace(/&/g, "&amp;")}</link>${input.published === undefined ? "" : `<pubDate>${input.published}</pubDate>`}</item>`;

function source(overrides: Partial<ClaimedSource> = {}): ClaimedSource {
  return {
    id: "source-1",
    leaseToken: "lease-1",
    catalogueKey: "fixture-source",
    publisherName: "Fixture Publisher",
    feedUrl: "https://feeds.example.com/news.xml",
    allowedHosts: ["feeds.example.com"],
    language: "en",
    countryCode: "IN",
    stateRegion: null,
    categoryScope: ["india"],
    expectedUpdateIntervalMs: 15 * 60 * 1000,
    consecutiveFailures: 0,
    etag: null,
    lastModified: null,
    ...overrides,
  };
}

describe("isolated ingestion orchestration", () => {
  const claim = vi.fn();
  const complete = vi.fn();
  const candidates = vi.fn();
  const insert = vi.fn();
  const heartbeat = vi.fn();
  const fetch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    complete.mockResolvedValue(true);
    candidates.mockResolvedValue([]);
    insert.mockResolvedValue({ inserted: 1, exactDuplicates: 0, nearDuplicates: 0 });
    heartbeat.mockResolvedValue(undefined);
  });

  it("isolates a malformed source and continues with the next claimed feed", async () => {
    claim.mockResolvedValue([
      source({ id: "bad", leaseToken: "bad-lease", catalogueKey: "bad-feed", feedUrl: "https://feeds.example.com/bad.xml" }),
      source({ id: "good", leaseToken: "good-lease", catalogueKey: "good-feed", feedUrl: "https://feeds.example.com/good.xml" }),
    ]);
    fetch.mockImplementation(async (requested: { feedUrl: string }) => requested.feedUrl.endsWith("bad.xml")
      ? { outcome: "success", body: "<rss><broken>", status: 200, responseBytes: 13, effectiveUrl: requested.feedUrl, etag: null, lastModified: null }
      : {
          outcome: "success",
          body: rss(
            item({ title: "Current story", url: "https://publisher.example/current", published: "Sat, 18 Jul 2026 05:00:00 GMT" })
            + item({ title: "Stale story", url: "https://publisher.example/stale", published: "Wed, 01 Jan 2025 00:00:00 GMT" }),
          ),
          status: 200,
          responseBytes: 500,
          effectiveUrl: requested.feedUrl,
          etag: '"etag"',
          lastModified: null,
        });

    const result = await runIngestionBatch({
      workerId: "worker-1",
      now: () => now,
      dependencies: { claim, complete, candidates, insert, heartbeat, fetch },
    });

    expect(result).toMatchObject({
      claimed: 2,
      succeeded: 1,
      failed: 1,
      parsedEntries: 2,
      rejectedEntries: 1,
      insertedArticles: 1,
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(complete).toHaveBeenCalledWith(expect.objectContaining({ sourceId: "bad", outcome: "failure", errorCode: "parse-malformed-xml" }));
    expect(complete).toHaveBeenCalledWith(expect.objectContaining({ sourceId: "good", outcome: "success", articleCount: 1 }));
    expect(heartbeat).toHaveBeenNthCalledWith(1, { state: "started", at: now });
    expect(heartbeat).toHaveBeenLastCalledWith({ state: "completed", at: now, batchSize: 2 });
  });

  it("completes conditional 304 responses as healthy without parsing or inserting", async () => {
    claim.mockResolvedValue([source()]);
    fetch.mockResolvedValue({
      outcome: "not-modified",
      status: 304,
      responseBytes: 0,
      effectiveUrl: "https://feeds.example.com/news.xml",
      etag: '"same"',
      lastModified: null,
    });
    const result = await runIngestionBatch({
      now: () => now,
      dependencies: { claim, complete, candidates, insert, heartbeat, fetch },
    });
    expect(result).toMatchObject({ claimed: 1, notModified: 1, succeeded: 0, failed: 0 });
    expect(candidates).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
    expect(complete).toHaveBeenCalledWith(expect.objectContaining({
      outcome: "not-modified",
      nextFetchAt: new Date("2026-07-18T06:15:00Z"),
    }));
  });

  it("persists Retry-After when it is later than exponential source backoff", async () => {
    claim.mockResolvedValue([source()]);
    fetch.mockRejectedValue(new FeedFetchError(
      "http-rate-limited",
      "rate limited",
      429,
      new Date("2026-07-18T06:20:00Z"),
    ));
    const result = await runIngestionBatch({
      now: () => now,
      dependencies: { claim, complete, candidates, insert, heartbeat, fetch },
    });
    expect(result.failed).toBe(1);
    expect(complete).toHaveBeenCalledWith(expect.objectContaining({
      outcome: "failure",
      httpStatus: 429,
      errorCode: "http-rate-limited",
      retryAfterAt: new Date("2026-07-18T06:20:00Z"),
      nextFetchAt: new Date("2026-07-18T06:20:00Z"),
    }));
  });

  it("rejects exact canonical duplicates within one complete feed without truncating other items", async () => {
    claim.mockResolvedValue([source()]);
    fetch.mockResolvedValue({
      outcome: "success",
      body: rss(
        item({ title: "First title", url: "https://publisher.example/story?utm_source=rss", published: "Sat, 18 Jul 2026 04:00:00 GMT" })
        + item({ title: "Updated title", url: "https://publisher.example/story?utm_medium=rss", published: "Sat, 18 Jul 2026 05:00:00 GMT" })
        + item({ title: "Another story", url: "https://publisher.example/another", published: "Sat, 18 Jul 2026 05:30:00 GMT" }),
      ),
      status: 200,
      responseBytes: 700,
      effectiveUrl: "https://feeds.example.com/news.xml",
      etag: null,
      lastModified: null,
    });
    insert.mockImplementation(async ({ articles }: { articles: unknown[] }) => ({
      inserted: articles.length,
      exactDuplicates: 0,
      nearDuplicates: 0,
    }));

    const result = await runIngestionBatch({
      now: () => now,
      dependencies: { claim, complete, candidates, insert, heartbeat, fetch },
    });
    expect(result).toMatchObject({
      parsedEntries: 3,
      rejectedEntries: 0,
      insertedArticles: 2,
      exactDuplicates: 1,
    });
    expect(insert.mock.calls[0]?.[0].articles).toHaveLength(2);
  });
});

