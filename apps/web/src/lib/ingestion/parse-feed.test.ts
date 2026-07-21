import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { FeedParseError, parseFeed } from "@/lib/ingestion/parse-feed";

const fixtureUrl = (name: string) => new URL(`./fixtures/${name}`, import.meta.url);

describe("defensive RSS and Atom parsing", () => {
  it("parses every RSS 2.0 item without an arbitrary item cap", async () => {
    const feed = parseFeed(await readFile(fixtureUrl("rss-2.xml"), "utf8"));
    expect(feed.format).toBe("rss-2.0");
    expect(feed.language).toBe("en-IN");
    expect(feed.entries).toHaveLength(3);
    expect(feed.entries[0]).toMatchObject({
      guid: "fixture-1",
      author: "Fixture Desk",
      categories: ["Business", "Policy"],
    });

    const items = Array.from({ length: 250 }, (_, index) =>
      `<item><title>Story ${index}</title><link>https://example.com/${index}</link><pubDate>Sat, 18 Jul 2026 00:00:00 GMT</pubDate></item>`,
    ).join("");
    expect(parseFeed(`<rss version="2.0"><channel>${items}</channel></rss>`).entries).toHaveLength(250);
  });

  it("parses Atom alternate links and namespaced metadata", async () => {
    const feed = parseFeed(await readFile(fixtureUrl("atom.xml"), "utf8"));
    expect(feed.format).toBe("atom");
    expect(feed.language).toBe("ml-IN");
    expect(feed.entries[0]).toMatchObject({
      url: "https://publisher.example/ml/story?fbclid=tracking",
      guid: "tag:publisher.example,2026:one",
      author: "ന്യൂസ് ഡെസ്ക്",
      published: "2026-07-18T05:00:00Z",
      updated: "2026-07-18T05:05:00Z",
      categories: ["Kerala"],
    });
  });

  it("parses RSS 1.0 RDF documents", async () => {
    const feed = parseFeed(await readFile(fixtureUrl("rss-1.rdf"), "utf8"));
    expect(feed.format).toBe("rss-1.0");
    expect(feed.entries).toHaveLength(1);
    expect(feed.entries[0]).toMatchObject({
      title: "RDF story",
      published: "2026-07-18T04:00:00Z",
      author: "RDF Desk",
    });
  });

  it("rejects malformed XML and unsupported documents with stable error codes", async () => {
    const malformed = await readFile(fixtureUrl("malformed.xml"), "utf8");
    expect(() => parseFeed(malformed)).toThrowError(
      expect.objectContaining<Partial<FeedParseError>>({ code: "malformed-xml" }),
    );
    expect(() => parseFeed("<html><body>not a feed</body></html>")).toThrowError(
      expect.objectContaining<Partial<FeedParseError>>({ code: "unsupported-feed" }),
    );
  });

  it("rejects DTD and entity declarations before invoking the parser", async () => {
    const doctype = await readFile(fixtureUrl("doctype.xml"), "utf8");
    expect(() => parseFeed(doctype)).toThrowError(
      expect.objectContaining<Partial<FeedParseError>>({ code: "forbidden-declaration" }),
    );
  });
});
