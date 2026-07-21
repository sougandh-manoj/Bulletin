import { describe, expect, it } from "vitest";

import type { IntelligenceEnvironment } from "@/env/server";
import { createStorySummaryProvider } from "@/lib/intelligence/factory";
import { GeminiSummaryProvider } from "@/lib/intelligence/gemini";
import { GroqSummaryProvider } from "@/lib/intelligence/groq";

const common = {
  GROQ_GENERATION_MODEL: "openai/gpt-oss-20b",
  GEMINI_GENERATION_MODEL: "gemini-model",
  PROVIDER_TIMEOUT_MS: 20_000,
  PROVIDER_MAX_ATTEMPTS: 1,
};

describe("story summary provider factory", () => {
  it("creates the selected Groq summary provider", () => {
    const environment = {
      ...common,
      INTELLIGENCE_PROVIDER: "groq",
      GROQ_API_KEY: "groq-secret",
    } as IntelligenceEnvironment;
    const provider = createStorySummaryProvider(environment);
    expect(provider).toBeInstanceOf(GroqSummaryProvider);
    expect(provider).toMatchObject({ name: "groq", generationModel: "openai/gpt-oss-20b" });
  });

  it("keeps Gemini available behind the same summary-only boundary", () => {
    const environment = {
      ...common,
      INTELLIGENCE_PROVIDER: "gemini",
      GEMINI_API_KEY: "gemini-secret",
    } as IntelligenceEnvironment;
    const provider = createStorySummaryProvider(environment);
    expect(provider).toBeInstanceOf(GeminiSummaryProvider);
    expect(provider).toMatchObject({ name: "gemini", generationModel: "gemini-model" });
  });
});
