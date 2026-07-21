import { describe, expect, it, vi } from "vitest";

import { GeminiSummaryProvider } from "@/lib/intelligence/gemini";

function provider(fetchImplementation: typeof fetch, overrides: Partial<ConstructorParameters<typeof GeminiSummaryProvider>[0]> = {}) {
  return new GeminiSummaryProvider({
    apiKey: "server-secret", generationModel: "generation-model",
    timeoutMs: 1_000, maxAttempts: 2, fetchImplementation, sleep: vi.fn().mockResolvedValue(undefined), random: () => 0,
    now: () => new Date("2026-07-18T00:00:00Z"), ...overrides,
  });
}

describe("Gemini provider boundary", () => {
  it("parses strict JSON text from an Interactions model-output step", async () => {
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ steps: [{ type: "model_output", content: [{ type: "text", text: "{\"passed\":true}" }] }] }), { status: 200 }));
    await expect(provider(request).generateStructured({ task: "summarization", prompt: "summarize", schemaName: "summary", jsonSchema: { type: "object" } })).resolves.toEqual({ passed: true });
    const [url, options] = request.mock.calls[0];
    expect(String(url)).not.toContain("server-secret");
    expect(options.headers["x-goog-api-key"]).toBe("server-secret");
    expect(JSON.parse(request.mock.calls[0][1].body).store).toBe(false);
  });

  it("retries a transient 429 once but never retries a permanent 400", async () => {
    const transient = vi.fn()
      .mockResolvedValueOnce(new Response("rate", { status: 429, headers: { "retry-after": "1" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ output_text: "{}" }), { status: 200 }));
    await provider(transient).generateStructured({ task: "summarization", prompt: "summarize", schemaName: "summary", jsonSchema: {} });
    expect(transient).toHaveBeenCalledTimes(2);

    const permanent = vi.fn().mockResolvedValue(new Response("bad", { status: 400 }));
    await expect(provider(permanent).generateStructured({ task: "summarization", prompt: "summarize", schemaName: "summary", jsonSchema: {} }))
      .rejects.toMatchObject({ code: "provider-request-rejected", retryable: false });
    expect(permanent).toHaveBeenCalledTimes(1);
  });

  it("identifies an unavailable model so the batch circuit can stop immediately", async () => {
    const request = vi.fn().mockResolvedValue(new Response("missing", { status: 404 }));
    await expect(provider(request).generateStructured({ task: "summarization", prompt: "summarize", schemaName: "summary", jsonSchema: {} }))
      .rejects.toMatchObject({ code: "provider-model-unavailable", retryable: false });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("fails closed on malformed structured output", async () => {
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ output_text: "not json" }), { status: 200 }));
    await expect(provider(request).generateStructured({ task: "summarization", prompt: "summary", schemaName: "summary", jsonSchema: {} }))
      .rejects.toMatchObject({ code: "provider-malformed-output", retryable: false });
  });
});
