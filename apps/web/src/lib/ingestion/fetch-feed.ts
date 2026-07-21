import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";

export const DEFAULT_FEED_TIMEOUT_MS = 8_000;
export const DEFAULT_FEED_MAX_BYTES = 2 * 1024 * 1024;
export const DEFAULT_REDIRECT_LIMIT = 3;
export const DEFAULT_FETCH_ATTEMPTS = 3;

const REDIRECT_STATUS = new Set([301, 302, 303, 307, 308]);
const RETRY_STATUS = new Set([408, 425, 429]);
const XML_CONTENT_TYPE = /^(?:application\/(?:atom\+xml|rss\+xml|xml)|text\/(?:xml|plain))(?:\s*;|$)/i;
const XML_PREFIX = /^(?:\uFEFF)?\s*(?:<\?xml\b|<rss\b|<feed\b|<(?:[a-z0-9_-]+:)?RDF\b)/iu;

export type FetchableSource = {
  feedUrl: string;
  allowedHosts: string[];
  etag: string | null;
  lastModified: string | null;
};

export type FeedFetchResult =
  | {
      outcome: "success";
      body: string;
      status: number;
      responseBytes: number;
      effectiveUrl: string;
      etag: string | null;
      lastModified: string | null;
    }
  | {
      outcome: "not-modified";
      status: 304;
      responseBytes: 0;
      effectiveUrl: string;
      etag: string | null;
      lastModified: string | null;
    };

export type FeedFetchErrorCode =
  | "invalid-feed-url"
  | "host-not-allowed"
  | "unsafe-address"
  | "redirect-invalid"
  | "redirect-limit"
  | "oversized-response"
  | "invalid-content-type"
  | "timeout"
  | "network-error"
  | "http-permanent"
  | "http-retryable"
  | "http-rate-limited";

export class FeedFetchError extends Error {
  constructor(
    public readonly code: FeedFetchErrorCode,
    message: string,
    public readonly status: number | null = null,
    public readonly retryAt: Date | null = null,
  ) {
    super(message);
    this.name = "FeedFetchError";
  }
}

type LookupAddress = { address: string; family: number };
type FetchFeedOptions = {
  fetchFn?: typeof fetch;
  lookup?: (hostname: string) => Promise<LookupAddress[]>;
  sleep?: (milliseconds: number) => Promise<void>;
  now?: () => Date;
  timeoutMs?: number;
  maxBytes?: number;
  redirectLimit?: number;
  attempts?: number;
};

function isUnsafeIpv4(address: string): boolean {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b, c] = parts;
  return a === 0
    || a === 10
    || a === 127
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && ((b === 0 && (c === 0 || c === 2)) || b === 168))
    || (a === 198 && (b === 18 || b === 19))
    || (a === 198 && b === 51 && c === 100)
    || (a === 203 && b === 0 && c === 113)
    || a >= 224;
}

function isUnsafeIp(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return isUnsafeIpv4(address);
  if (family !== 6) return true;
  const normalized = address.toLowerCase();
  if (normalized.startsWith("::ffff:")) {
    const mapped = normalized.slice("::ffff:".length);
    return isIP(mapped) !== 4 || isUnsafeIpv4(mapped);
  }
  return normalized === "::"
    || normalized === "::1"
    || normalized.startsWith("fc")
    || normalized.startsWith("fd")
    || /^fe[89ab]/.test(normalized)
    || normalized.startsWith("ff")
    || normalized.startsWith("2001:db8:");
}

async function defaultLookup(hostname: string): Promise<LookupAddress[]> {
  return dnsLookup(hostname, { all: true, verbatim: true });
}

function validatedUrl(value: string, allowedHosts: Set<string>): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new FeedFetchError("invalid-feed-url", "Feed URL is invalid");
  }
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new FeedFetchError("invalid-feed-url", "Feed URL must be credential-free HTTPS");
  }
  if (!allowedHosts.has(url.hostname.toLowerCase())) {
    throw new FeedFetchError("host-not-allowed", "Feed host is not allowlisted");
  }
  return url;
}

async function assertPublicAddress(url: URL, lookup: NonNullable<FetchFeedOptions["lookup"]>): Promise<void> {
  const literalFamily = isIP(url.hostname);
  const addresses = literalFamily
    ? [{ address: url.hostname, family: literalFamily }]
    : await lookup(url.hostname);
  if (addresses.length === 0 || addresses.some(({ address }) => isUnsafeIp(address))) {
    throw new FeedFetchError("unsafe-address", "Feed host resolves to a non-public address");
  }
}

function retryAfterDate(value: string | null, now: Date): Date | null {
  if (!value) return null;
  if (/^\d+$/.test(value.trim())) {
    return new Date(now.getTime() + Number(value.trim()) * 1000);
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && parsed > now.getTime() ? new Date(parsed) : null;
}

function isRetryableStatus(status: number): boolean {
  return RETRY_STATUS.has(status) || status >= 500;
}

async function readBoundedBody(response: Response, maxBytes: number): Promise<{ body: string; bytes: number }> {
  const contentLength = response.headers.get("content-length");
  if (contentLength && /^\d+$/.test(contentLength) && Number(contentLength) > maxBytes) {
    await response.body?.cancel().catch(() => undefined);
    throw new FeedFetchError("oversized-response", "Feed response exceeds the configured size limit", response.status);
  }
  if (!response.body) return { body: "", bytes: 0 };

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new FeedFetchError("oversized-response", "Feed response exceeds the configured size limit", response.status);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const merged = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { body: new TextDecoder("utf-8", { fatal: false }).decode(merged), bytes };
}

async function fetchAttempt(input: {
  source: FetchableSource;
  fetchFn: typeof fetch;
  lookup: NonNullable<FetchFeedOptions["lookup"]>;
  timeoutMs: number;
  maxBytes: number;
  redirectLimit: number;
  now: () => Date;
}): Promise<FeedFetchResult> {
  const allowedHosts = new Set(input.source.allowedHosts.map((host) => host.toLowerCase()));
  let url = validatedUrl(input.source.feedUrl, allowedHosts);

  for (let redirects = 0; ; redirects += 1) {
    await assertPublicAddress(url, input.lookup);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), input.timeoutMs);
    let response: Response;
    try {
      response = await input.fetchFn(url, {
        method: "GET",
        redirect: "manual",
        cache: "no-store",
        signal: controller.signal,
        headers: {
          Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, text/plain;q=0.5",
          "User-Agent": "Bulletin/0.1 metadata feed reader",
          ...(input.source.etag ? { "If-None-Match": input.source.etag } : {}),
          ...(input.source.lastModified ? { "If-Modified-Since": input.source.lastModified } : {}),
        },
      });
    } catch (error) {
      if (controller.signal.aborted || (error instanceof Error && error.name === "AbortError")) {
        throw new FeedFetchError("timeout", "Feed request timed out");
      }
      if (error instanceof FeedFetchError) throw error;
      throw new FeedFetchError("network-error", "Feed request failed before a response");
    } finally {
      clearTimeout(timeout);
    }

    if (REDIRECT_STATUS.has(response.status)) {
      await response.body?.cancel().catch(() => undefined);
      if (redirects >= input.redirectLimit) {
        throw new FeedFetchError("redirect-limit", "Feed exceeded the redirect limit", response.status);
      }
      const location = response.headers.get("location");
      if (!location) throw new FeedFetchError("redirect-invalid", "Feed redirect has no location", response.status);
      try {
        url = validatedUrl(new URL(location, url).toString(), allowedHosts);
      } catch (error) {
        if (error instanceof FeedFetchError) throw error;
        throw new FeedFetchError("redirect-invalid", "Feed redirect location is invalid", response.status);
      }
      continue;
    }

    const etag = response.headers.get("etag");
    const lastModified = response.headers.get("last-modified");
    if (response.status === 304) {
      await response.body?.cancel().catch(() => undefined);
      return {
        outcome: "not-modified",
        status: 304,
        responseBytes: 0,
        effectiveUrl: url.toString(),
        etag,
        lastModified,
      };
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      const retryAt = retryAfterDate(response.headers.get("retry-after"), input.now());
      const code = response.status === 429 ? "http-rate-limited" : isRetryableStatus(response.status) ? "http-retryable" : "http-permanent";
      throw new FeedFetchError(code, "Feed returned an unsuccessful HTTP status", response.status, retryAt);
    }

    const contentType = response.headers.get("content-type");
    if (contentType && !XML_CONTENT_TYPE.test(contentType)) {
      await response.body?.cancel().catch(() => undefined);
      throw new FeedFetchError("invalid-content-type", "Feed response is not an allowed XML content type", response.status);
    }
    const { body, bytes } = await readBoundedBody(response, input.maxBytes);
    if (!XML_PREFIX.test(body)) {
      throw new FeedFetchError("invalid-content-type", "Feed response does not have an XML feed signature", response.status);
    }
    return {
      outcome: "success",
      body,
      status: response.status,
      responseBytes: bytes,
      effectiveUrl: url.toString(),
      etag,
      lastModified,
    };
  }
}

export async function fetchFeed(source: FetchableSource, options: FetchFeedOptions = {}): Promise<FeedFetchResult> {
  const fetchFn = options.fetchFn ?? fetch;
  const lookup = options.lookup ?? defaultLookup;
  const sleep = options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const now = options.now ?? (() => new Date());
  const attempts = Math.max(1, Math.min(options.attempts ?? DEFAULT_FETCH_ATTEMPTS, DEFAULT_FETCH_ATTEMPTS));
  let lastError: FeedFetchError | null = null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await fetchAttempt({
        source,
        fetchFn,
        lookup,
        timeoutMs: options.timeoutMs ?? DEFAULT_FEED_TIMEOUT_MS,
        maxBytes: options.maxBytes ?? DEFAULT_FEED_MAX_BYTES,
        redirectLimit: options.redirectLimit ?? DEFAULT_REDIRECT_LIMIT,
        now,
      });
    } catch (error) {
      const fetchError = error instanceof FeedFetchError
        ? error
        : new FeedFetchError("network-error", "Unexpected feed request failure");
      lastError = fetchError;
      const retryable = fetchError.code === "timeout"
        || fetchError.code === "network-error"
        || fetchError.code === "http-retryable";
      if (!retryable || attempt + 1 >= attempts) break;

      const retryAt = fetchError.retryAt;
      const retryDelay = retryAt
        ? retryAt.getTime() - now().getTime()
        : [250, 1_000][attempt] ?? 1_000;
      if (retryDelay > 2_000) break;
      await sleep(Math.max(0, retryDelay));
    }
  }
  throw lastError ?? new FeedFetchError("network-error", "Feed request did not complete");
}
