import "server-only";

export type ProviderTaskKind = "summarization" | "localization";

export class IntelligenceProviderError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly retryable: boolean,
    public readonly retryAt: Date | null = null,
    public readonly status: number | null = null,
  ) {
    super(message);
    this.name = "IntelligenceProviderError";
  }
}

export type StructuredGenerationRequest = {
  task: ProviderTaskKind;
  prompt: string;
  schemaName: string;
  jsonSchema: Record<string, unknown>;
};

export interface StorySummaryProvider {
  readonly name: string;
  readonly generationModel: string;
  generateStructured(input: StructuredGenerationRequest): Promise<unknown>;
}

export function estimatedInputUnits(value: string): number {
  return Math.max(1, Math.ceil(value.length / 4));
}
