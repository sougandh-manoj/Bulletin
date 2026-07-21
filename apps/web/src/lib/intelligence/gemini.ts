import "server-only";

import {
  IntelligenceProviderError,
  type StorySummaryProvider,
  type StructuredGenerationRequest,
} from "@/lib/intelligence/provider";

type GeminiProviderOptions = {
  apiKey: string;
  generationModel: string;
  timeoutMs: number;
  maxAttempts: number;
  fetchImplementation?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
  random?: () => number;
  now?: () => Date;
};

const TRANSIENT_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

function retryAfter(response: Response, now: Date): Date | null {
  const value = response.headers.get("retry-after");
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return new Date(now.getTime() + seconds * 1_000);
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function responseCode(status: number): string {
  if (status === 429) return "provider-rate-limited";
  if (status === 401 || status === 403) return "provider-auth-failed";
  if (status === 404) return "provider-model-unavailable";
  if (status === 400 || status === 422) return "provider-request-rejected";
  return TRANSIENT_STATUSES.has(status) ? "provider-transient" : "provider-failed";
}

function textFromInteraction(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.output_text === "string") return record.output_text;
  if (Array.isArray(record.steps)) {
    for (const step of [...record.steps].reverse()) {
      if (!step || typeof step !== "object") continue;
      const content = (step as Record<string, unknown>).content;
      if (Array.isArray(content)) {
        for (const item of content) {
          if (item && typeof item === "object" && typeof (item as Record<string, unknown>).text === "string") {
            return (item as Record<string, unknown>).text as string;
          }
        }
      }
    }
  }
  if (Array.isArray(record.outputs)) {
    for (const output of record.outputs) {
      const nested = textFromInteraction(output);
      if (nested) return nested;
    }
  }
  return null;
}

export class GeminiSummaryProvider implements StorySummaryProvider {
  readonly name = "gemini";
  readonly generationModel: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly maxAttempts: number;
  private readonly request: typeof fetch;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly random: () => number;
  private readonly now: () => Date;

  constructor(options: GeminiProviderOptions) {
    this.apiKey = options.apiKey;
    this.generationModel = options.generationModel;
    this.timeoutMs = options.timeoutMs;
    this.maxAttempts = Math.max(1, Math.min(options.maxAttempts, 3));
    this.request = options.fetchImplementation ?? fetch;
    this.sleep = options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
    this.random = options.random ?? Math.random;
    this.now = options.now ?? (() => new Date());
  }

  private async post(url: string, body: Record<string, unknown>): Promise<unknown> {
    let lastError: IntelligenceProviderError | null = null;
    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const response = await this.request(url, {
          method: "POST",
          headers: { "content-type": "application/json", "x-goog-api-key": this.apiKey },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        if (!response.ok) {
          const retryable = TRANSIENT_STATUSES.has(response.status);
          const retryAt = retryAfter(response, this.now());
          lastError = new IntelligenceProviderError(
            responseCode(response.status),
            `Provider request failed with status ${response.status}`,
            retryable,
            retryAt,
            response.status,
          );
          if (!retryable || attempt === this.maxAttempts) throw lastError;
          const delay = retryAt
            ? Math.max(0, retryAt.getTime() - this.now().getTime())
            : Math.min(4_000, 250 * (2 ** (attempt - 1))) + Math.floor(this.random() * 250);
          await this.sleep(delay);
          continue;
        }
        try {
          return await response.json();
        } catch {
          throw new IntelligenceProviderError("provider-malformed-json", "Provider returned malformed JSON", false, null, response.status);
        }
      } catch (error) {
        if (error instanceof IntelligenceProviderError) throw error;
        const aborted = error instanceof Error && error.name === "AbortError";
        lastError = new IntelligenceProviderError(
          aborted ? "provider-timeout" : "provider-network-error",
          aborted ? "Provider request timed out" : "Provider request failed",
          true,
        );
        if (attempt === this.maxAttempts) throw lastError;
        await this.sleep(Math.min(4_000, 250 * (2 ** (attempt - 1))) + Math.floor(this.random() * 250));
      } finally {
        clearTimeout(timeout);
      }
    }
    throw lastError ?? new IntelligenceProviderError("provider-failed", "Provider request failed", false);
  }

  async generateStructured(input: StructuredGenerationRequest): Promise<unknown> {
    const response = await this.post("https://generativelanguage.googleapis.com/v1beta/interactions", {
      model: this.generationModel,
      input: input.prompt,
      store: false,
      response_format: {
        type: "text",
        mime_type: "application/json",
        schema: input.jsonSchema,
      },
    });
    const text = textFromInteraction(response);
    if (!text) throw new IntelligenceProviderError("provider-empty-output", "Provider returned no structured output", false);
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new IntelligenceProviderError("provider-malformed-output", "Provider output did not match JSON encoding", false);
    }
  }
}
