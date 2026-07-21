import { describe, expect, it, vi } from "vitest";

import { fetchFeed } from "@/lib/ingestion/fetch-feed";

const source = {
  feedUrl: "https://feeds.example.com/news.xml",
  allowedHosts: ["feeds.example.com", "cdn.example.com"],
  etag: '"old-etag"',
  lastModified: "Fri, 17 Jul 2026 00:00:00 GMT",
};
const publicLookup = vi.fn(async () => [{ address: "93.184.216.34", family: 4 }]);
const xml = '<?xml version="1.0"?><rss version="2.0"><channel><title>Fixture</title></channel></rss>';

function sequence(...responses: (Response | Error | ((input: URL | RequestInfo, init?: RequestInit) => Promise<Response>))[]) {
  const mock = vi.fn<typeof fetch>();
  for (const response of responses) {
    if (typeof response === "function") mock.mockImplementationOnce(response as typeof fetch);
    else if (response instanceof Error) mock.mockRejectedValueOnce(response);
    else mock.mockResolvedValueOnce(response);
  }
  return mock;
}

describe("safe feed fetching", () => {
  it("sends conditional headers and handles 304 without parsing a body", async () => {
    const fetchFn = sequence(new Response(null, {
      status: 304,
      headers: { ETag: '"new-etag"', "Last-Modified": "Sat, 18 Jul 2026 00:00:00 GMT" },
    }));
    const result = await fetchFeed(source, { fetchFn, lookup: publicLookup });
    expect(result).toMatchObject({ outcome: "not-modified", status: 304, responseBytes: 0, etag: '"new-etag"' });
    const headers = new Headers(fetchFn.mock.calls[0]?.[1]?.headers);
    expect(headers.get("if-none-match")).toBe('"old-etag"');
    expect(headers.get("if-modified-since")).toBe(source.lastModified);
  });

  it("follows only bounded allowlisted HTTPS redirects", async () => {
    const fetchFn = sequence(
      new Response(null, { status: 302, headers: { Location: "https://cdn.example.com/feed.xml" } }),
      new Response(xml, { status: 200, headers: { "Content-Type": "application/rss+xml", ETag: '"fresh"' } }),
    );
    const result = await fetchFeed(source, { fetchFn, lookup: publicLookup });
    expect(result).toMatchObject({ outcome: "success", effectiveUrl: "https://cdn.example.com/feed.xml", etag: '"fresh"' });
    expect(fetchFn).toHaveBeenCalledTimes(2);

    await expect(fetchFeed(source, {
      fetchFn: sequence(new Response(null, { status: 302, headers: { Location: "https://private.example.net/feed" } })),
      lookup: publicLookup,
    })).rejects.toMatchObject({ code: "host-not-allowed" });
  });

  it("enforces the redirect limit", async () => {
    const fetchFn = sequence(
      new Response(null, { status: 302, headers: { Location: "/one" } }),
      new Response(null, { status: 302, headers: { Location: "/two" } }),
    );
    await expect(fetchFeed(source, { fetchFn, lookup: publicLookup, redirectLimit: 1 }))
      .rejects.toMatchObject({ code: "redirect-limit" });
  });

  it("blocks private DNS answers and credentialed or non-HTTPS URLs", async () => {
    await expect(fetchFeed(source, {
      fetchFn: sequence(new Response(xml)),
      lookup: async () => [{ address: "127.0.0.1", family: 4 }],
    })).rejects.toMatchObject({ code: "unsafe-address" });
    await expect(fetchFeed({ ...source, feedUrl: "http://feeds.example.com/news.xml" }, { lookup: publicLookup }))
      .rejects.toMatchObject({ code: "invalid-feed-url" });
    await expect(fetchFeed({ ...source, feedUrl: "https://user:secret@feeds.example.com/news.xml" }, { lookup: publicLookup }))
      .rejects.toMatchObject({ code: "invalid-feed-url" });
  });

  it("rejects declared and streamed oversized responses", async () => {
    await expect(fetchFeed(source, {
      fetchFn: sequence(new Response(xml, { status: 200, headers: { "Content-Type": "text/xml", "Content-Length": "9999" } })),
      lookup: publicLookup,
      maxBytes: 100,
    })).rejects.toMatchObject({ code: "oversized-response" });

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("<?xml version=\"1.0\"?>"));
        controller.enqueue(new Uint8Array(200));
        controller.close();
      },
    });
    await expect(fetchFeed(source, {
      fetchFn: sequence(new Response(stream, { status: 200, headers: { "Content-Type": "application/xml" } })),
      lookup: publicLookup,
      maxBytes: 100,
    })).rejects.toMatchObject({ code: "oversized-response" });
  });

  it("content-sniffs text/plain XML but rejects HTML", async () => {
    await expect(fetchFeed(source, {
      fetchFn: sequence(new Response(xml, { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8" } })),
      lookup: publicLookup,
    })).resolves.toMatchObject({ outcome: "success" });
    await expect(fetchFeed(source, {
      fetchFn: sequence(new Response("<html>challenge</html>", { status: 200, headers: { "Content-Type": "text/html" } })),
      lookup: publicLookup,
    })).rejects.toMatchObject({ code: "invalid-content-type" });
  });

  it("retries retryable failures with controlled deterministic backoff", async () => {
    const sleep = vi.fn(async () => undefined);
    const fetchFn = sequence(
      new Response(null, { status: 500 }),
      new Error("temporary network failure"),
      new Response(xml, { status: 200, headers: { "Content-Type": "application/xml" } }),
    );
    await expect(fetchFeed(source, { fetchFn, lookup: publicLookup, sleep }))
      .resolves.toMatchObject({ outcome: "success" });
    expect(sleep).toHaveBeenNthCalledWith(1, 250);
    expect(sleep).toHaveBeenNthCalledWith(2, 1_000);
  });

  it("honors Retry-After by returning a schedulable rate-limit time", async () => {
    const now = new Date("2026-07-18T06:00:00Z");
    await expect(fetchFeed(source, {
      fetchFn: sequence(new Response(null, { status: 429, headers: { "Retry-After": "120" } })),
      lookup: publicLookup,
      now: () => now,
    })).rejects.toMatchObject({
      code: "http-rate-limited",
      status: 429,
      retryAt: new Date("2026-07-18T06:02:00Z"),
    });
  });

  it("turns aborts into bounded timeout failures and retries them", async () => {
    const sleep = vi.fn(async () => undefined);
    const abortingFetch = vi.fn<typeof fetch>((_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
    }));
    await expect(fetchFeed(source, {
      fetchFn: abortingFetch,
      lookup: publicLookup,
      timeoutMs: 2,
      attempts: 2,
      sleep,
    })).rejects.toMatchObject({ code: "timeout" });
    expect(abortingFetch).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(250);
  });

  it("does not retry permanent HTTP failures", async () => {
    const fetchFn = sequence(new Response(null, { status: 404 }));
    await expect(fetchFeed(source, { fetchFn, lookup: publicLookup }))
      .rejects.toMatchObject({ code: "http-permanent", status: 404 });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});
