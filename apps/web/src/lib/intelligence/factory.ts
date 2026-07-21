import "server-only";

import type { IntelligenceEnvironment } from "@/env/server";
import { GeminiSummaryProvider } from "@/lib/intelligence/gemini";
import { GroqSummaryProvider } from "@/lib/intelligence/groq";
import type { StorySummaryProvider } from "@/lib/intelligence/provider";

export function createStorySummaryProvider(environment: IntelligenceEnvironment): StorySummaryProvider {
  if (environment.INTELLIGENCE_PROVIDER === "groq") {
    return new GroqSummaryProvider({
      apiKey: environment.GROQ_API_KEY,
      generationModel: environment.GROQ_GENERATION_MODEL,
      timeoutMs: environment.PROVIDER_TIMEOUT_MS,
      maxAttempts: environment.PROVIDER_MAX_ATTEMPTS,
    });
  }
  return new GeminiSummaryProvider({
    apiKey: environment.GEMINI_API_KEY,
    generationModel: environment.GEMINI_GENERATION_MODEL,
    timeoutMs: environment.PROVIDER_TIMEOUT_MS,
    maxAttempts: environment.PROVIDER_MAX_ATTEMPTS,
  });
}
