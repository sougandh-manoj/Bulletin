import { XMLParser, XMLValidator } from "fast-xml-parser";

import type { ParsedFeed, ParsedFeedEntry } from "@/lib/ingestion/types";

export const FEED_PARSER_VERSION = "fast-xml-parser-5.10.0/phase-6-v1";
const FORBIDDEN_DECLARATION = /<!\s*(?:DOCTYPE|ENTITY)\b/iu;

type XmlRecord = Record<string, unknown>;

export class FeedParseError extends Error {
  constructor(public readonly code: "forbidden-declaration" | "malformed-xml" | "unsupported-feed", message: string) {
    super(message);
    this.name = "FeedParseError";
  }
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: false,
  processEntities: false,
  maxNestedTags: 64,
  isArray: (tagName) =>
    tagName === "item"
    || tagName === "entry"
    || tagName === "category"
    || tagName === "link",
});

function record(value: unknown): XmlRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as XmlRecord
    : null;
}

function array(value: unknown): unknown[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function decodeXmlText(value: string): string {
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    quot: '"',
  };
  return value.replace(/&(#(?:x[0-9a-f]+|[0-9]+)|amp|apos|gt|lt|quot);/gi, (entity, name: string) => {
    if (!name.startsWith("#")) return named[name.toLowerCase()] ?? entity;
    const hexadecimal = name[1]?.toLowerCase() === "x";
    const codePoint = Number.parseInt(name.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10);
    if (!Number.isInteger(codePoint) || codePoint <= 0 || codePoint > 0x10ffff) return "";
    return String.fromCodePoint(codePoint);
  });
}

function text(value: unknown): string | null {
  if (Array.isArray(value)) {
    for (const candidate of value) {
      const result = text(candidate);
      if (result) return result;
    }
    return null;
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    const result = decodeXmlText(String(value)).trim();
    return result || null;
  }
  const object = record(value);
  if (!object) return null;
  return text(object["#text"] ?? object["@_href"] ?? object["@_url"]);
}

function atomLink(value: unknown): string | null {
  const links = array(value);
  for (const link of links) {
    if (typeof link === "string") return text(link);
    const object = record(link);
    if (!object) continue;
    const relation = text(object["@_rel"]);
    if (!relation || relation === "alternate") {
      const href = text(object["@_href"]);
      if (href) return href;
    }
  }
  return null;
}

function categories(value: unknown): string[] {
  return array(value)
    .map((category) => {
      const object = record(category);
      return object ? text(object["@_term"] ?? object["#text"]) : text(category);
    })
    .filter((category): category is string => Boolean(category));
}

function author(value: unknown): string | null {
  const object = record(value);
  return object ? text(object.name ?? object.email ?? object["#text"]) : text(value);
}

function parseEntry(value: unknown, atom: boolean): ParsedFeedEntry {
  const item = record(value) ?? {};
  const itemLink = atom ? atomLink(item.link) : text(item.link);
  const guid = text(item.guid ?? item.id);
  return {
    title: text(item.title),
    url: itemLink ?? (guid?.startsWith("http://") || guid?.startsWith("https://") ? guid : null),
    guid,
    description: text(item.description ?? item.summary ?? item.content ?? item.encoded),
    author: author(item.author ?? item.creator),
    published: text(item.pubDate ?? item.published ?? item.date),
    updated: text(item.updated ?? item.modified),
    language: text(item.language ?? item["@_lang"]),
    categories: categories(item.category),
    raw: item,
  };
}

export function parseFeed(xmlInput: string): ParsedFeed {
  const xml = xmlInput.replace(/^\uFEFF/, "").trim();
  if (FORBIDDEN_DECLARATION.test(xml)) {
    throw new FeedParseError("forbidden-declaration", "Feed contains a forbidden XML declaration");
  }
  const validation = XMLValidator.validate(xml, {
    allowBooleanAttributes: false,
    unpairedTags: [],
  });
  if (validation !== true) {
    throw new FeedParseError("malformed-xml", "Feed XML is malformed");
  }

  let parsed: XmlRecord;
  try {
    parsed = parser.parse(xml) as XmlRecord;
  } catch {
    throw new FeedParseError("malformed-xml", "Feed XML could not be parsed");
  }

  const rss = record(parsed.rss);
  if (rss) {
    const channel = record(rss.channel);
    if (!channel) throw new FeedParseError("unsupported-feed", "RSS channel is missing");
    return {
      format: "rss-2.0",
      title: text(channel.title),
      language: text(channel.language ?? channel["@_lang"]),
      entries: array(channel.item).map((item) => parseEntry(item, false)),
    };
  }

  const feed = record(parsed.feed);
  if (feed) {
    return {
      format: "atom",
      title: text(feed.title),
      language: text(feed.language ?? feed["@_lang"]),
      entries: array(feed.entry).map((entry) => parseEntry(entry, true)),
    };
  }

  const rdf = record(parsed.RDF);
  if (rdf) {
    const channel = record(rdf.channel) ?? {};
    return {
      format: "rss-1.0",
      title: text(channel.title),
      language: text(channel.language ?? channel["@_lang"]),
      entries: array(rdf.item).map((item) => parseEntry(item, false)),
    };
  }

  throw new FeedParseError("unsupported-feed", "Document is not a supported RSS or Atom feed");
}
