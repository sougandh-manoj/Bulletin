import "server-only";

import {
  IntelligenceProviderError,
  type StorySummaryProvider,
  type StructuredGenerationRequest,
} from "@/lib/intelligence/provider";

type GroqProviderOptions = {
  apiKey: string;
  generationModel: string;
  timeoutMs: number;
  maxAttempts: number;
  fetchImplementation?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
  random?: () => number;
  now?: () => Date;
};

const GROQ_CHAT_COMPLETIONS_URL = "https://api.groq.com/openai/v1/chat/completions";
const TRANSIENT_STATUSES = new Set([408, 425, 429, 498, 500, 502, 503, 504]);
const UNSUPPORTED_STRICT_SCHEMA_KEYWORDS = new Set([
  "format",
  "maxItems",
  "maxLength",
  "minItems",
  "minLength",
  "pattern",
  "uniqueItems",
]);

function groqCompatibleSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(groqCompatibleSchema);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([key]) => !UNSUPPORTED_STRICT_SCHEMA_KEYWORDS.has(key))
    .map(([key, nested]) => [key, groqCompatibleSchema(nested)]));
}

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
  if (status === 413) return "provider-request-too-large";
  if (status === 400 || status === 422) return "provider-request-rejected";
  return TRANSIENT_STATUSES.has(status) ? "provider-transient" : "provider-failed";
}

function textFromChatCompletion(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const choices = (value as Record<string, unknown>).choices;
  if (!Array.isArray(choices)) return null;
  for (const choice of choices) {
    if (!choice || typeof choice !== "object") continue;
    const message = (choice as Record<string, unknown>).message;
    if (!message || typeof message !== "object") continue;
    const content = (message as Record<string, unknown>).content;
    if (typeof content === "string" && content.trim()) return content;
  }
  return null;
}

export class GroqSummaryProvider implements StorySummaryProvider {
  readonly name = "groq";
  readonly generationModel: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly maxAttempts: number;
  private readonly request: typeof fetch;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly random: () => number;
  private readonly now: () => Date;

  constructor(options: GroqProviderOptions) {
    this.apiKey = options.apiKey;
    this.generationModel = options.generationModel;
    this.timeoutMs = options.timeoutMs;
    this.maxAttempts = Math.max(1, Math.min(options.maxAttempts, 3));
    this.request = options.fetchImplementation ?? fetch;
    this.sleep = options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
    this.random = options.random ?? Math.random;
    this.now = options.now ?? (() => new Date());
  }

  private async post(body: Record<string, unknown>): Promise<unknown> {
    let lastError: IntelligenceProviderError | null = null;
    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const response = await this.request(GROQ_CHAT_COMPLETIONS_URL, {
          method: "POST",
          headers: {
            authorization: `Bearer ${this.apiKey}`,
            "content-type": "application/json",
          },
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
    const response = await this.post({
      model: this.generationModel,
      messages: [{ role: "user", content: input.prompt }],
      reasoning_effort: "low",
      max_completion_tokens: 2_048,
      stream: false,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: input.schemaName,
          strict: true,
          // Groq strict mode accepts a JSON Schema subset. Runtime Zod parsing
          // below continues to enforce Bulletin's string/array size bounds.
          schema: groqCompatibleSchema(input.jsonSchema),
        },
      },
    });
    const text = textFromChatCompletion(response);
    if (!text) throw new IntelligenceProviderError("provider-empty-output", "Provider returned no structured output", false);
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new IntelligenceProviderError("provider-malformed-output", "Provider output did not match JSON encoding", false);
    }
  }
}
