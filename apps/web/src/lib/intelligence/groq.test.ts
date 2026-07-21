import { describe, expect, it, vi } from "vitest";

import { GroqSummaryProvider } from "@/lib/intelligence/groq";

function provider(fetchImplementation: typeof fetch, overrides: Partial<ConstructorParameters<typeof GroqSummaryProvider>[0]> = {}) {
  return new GroqSummaryProvider({
    apiKey: "server-secret", generationModel: "openai/gpt-oss-20b",
    timeoutMs: 1_000, maxAttempts: 2, fetchImplementation, sleep: vi.fn().mockResolvedValue(undefined), random: () => 0,
    now: () => new Date("2026-07-19T00:00:00Z"), ...overrides,
  });
}

const structuredRequest = {
  task: "summarization" as const,
  prompt: "Summarize the supplied public-news evidence.",
  schemaName: "bulletin_summary",
  jsonSchema: {
    type: "object",
    additionalProperties: false,
    required: ["passed"],
    properties: { passed: { type: "boolean" } },
  },
};

describe("Groq provider boundary", () => {
  it("uses strict structured output without exposing the key in the URL or body", async () => {
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: "{\"passed\":true}" } }],
    }), { status: 200 }));

    await expect(provider(request).generateStructured(structuredRequest)).resolves.toEqual({ passed: true });

    const [url, options] = request.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(String(url)).toBe("https://api.groq.com/openai/v1/chat/completions");
    expect(String(url)).not.toContain("server-secret");
    expect(options.headers.authorization).toBe("Bearer server-secret");
    expect(options.body).not.toContain("server-secret");
    expect(body).toMatchObject({
      model: "openai/gpt-oss-20b",
      reasoning_effort: "low",
      max_completion_tokens: 2_048,
      stream: false,
      response_format: {
        type: "json_schema",
        json_schema: { name: "bulletin_summary", strict: true, schema: structuredRequest.jsonSchema },
      },
    });
    expect(body.messages).toEqual([{ role: "user", content: structuredRequest.prompt }]);
  });

  it("removes unsupported strict-schema bounds while preserving shape constraints", async () => {
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: "{\"items\":[\"ok\"]}" } }],
    }), { status: 200 }));
    await provider(request).generateStructured({
      ...structuredRequest,
      jsonSchema: {
        type: "object",
        additionalProperties: false,
        required: ["items"],
        properties: {
          items: {
            type: "array",
            minItems: 1,
            maxItems: 4,
            items: { type: "string", minLength: 1, maxLength: 64 },
          },
        },
      },
    });
    const body = JSON.parse(request.mock.calls[0][1].body);
    expect(body.response_format.json_schema.schema).toEqual({
      type: "object",
      additionalProperties: false,
      required: ["items"],
      properties: { items: { type: "array", items: { type: "string" } } },
    });
  });

  it("retries a transient 429 once but never retries a permanent 400", async () => {
    const transient = vi.fn()
      .mockResolvedValueOnce(new Response("rate", { status: 429, headers: { "retry-after": "1" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: "{}" } }] }), { status: 200 }));
    await provider(transient).generateStructured({ ...structuredRequest, jsonSchema: {} });
    expect(transient).toHaveBeenCalledTimes(2);

    const permanent = vi.fn().mockResolvedValue(new Response("bad", { status: 400 }));
    await expect(provider(permanent).generateStructured(structuredRequest))
      .rejects.toMatchObject({ code: "provider-request-rejected", retryable: false });
    expect(permanent).toHaveBeenCalledTimes(1);
  });

  it("identifies unavailable models and oversized requests as permanent failures", async () => {
    const missing = vi.fn().mockResolvedValue(new Response("missing", { status: 404 }));
    await expect(provider(missing).generateStructured(structuredRequest))
      .rejects.toMatchObject({ code: "provider-model-unavailable", retryable: false });

    const oversized = vi.fn().mockResolvedValue(new Response("large", { status: 413 }));
    await expect(provider(oversized).generateStructured(structuredRequest))
      .rejects.toMatchObject({ code: "provider-request-too-large", retryable: false });
  });

  it("fails closed on missing or malformed structured content", async () => {
    const empty = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: null } }] }), { status: 200 }));
    await expect(provider(empty).generateStructured(structuredRequest))
      .rejects.toMatchObject({ code: "provider-empty-output", retryable: false });

    const malformed = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: "not json" } }] }), { status: 200 }));
    await expect(provider(malformed).generateStructured(structuredRequest))
      .rejects.toMatchObject({ code: "provider-malformed-output", retryable: false });
  });
});
