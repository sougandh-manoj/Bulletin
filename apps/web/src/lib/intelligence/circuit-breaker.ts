import "server-only";

import { IntelligenceProviderError } from "@/lib/intelligence/provider";

const IMMEDIATE_OPEN_CODES = new Set([
  "provider-auth-failed",
  "provider-model-unavailable",
]);

const COUNTED_PERMANENT_CODES = new Set([
  "provider-empty-output",
  "provider-malformed-json",
  "provider-malformed-output",
  "provider-request-rejected",
  "provider-schema-invalid",
]);

export class ProviderCircuitBreaker {
  private consecutivePermanentFailures = 0;
  private retryAtValue: Date | null = null;

  constructor(
    private readonly failureThreshold = 3,
    private readonly cooldownMilliseconds = 15 * 60_000,
  ) {}

  get retryAt(): Date | null {
    return this.retryAtValue;
  }

  assertAvailable(now: Date): void {
    if (!this.retryAtValue) return;
    if (now >= this.retryAtValue) {
      this.reset();
      return;
    }
    throw new IntelligenceProviderError(
      "provider-circuit-open",
      "Provider calls are paused after repeated permanent failures",
      true,
      this.retryAtValue,
    );
  }

  recordSuccess(): void {
    this.reset();
  }

  recordFailure(code: string, now: Date): boolean {
    if (code === "provider-circuit-open") return true;
    if (IMMEDIATE_OPEN_CODES.has(code)) {
      this.open(now);
      return true;
    }
    if (!COUNTED_PERMANENT_CODES.has(code)) {
      this.consecutivePermanentFailures = 0;
      return false;
    }
    this.consecutivePermanentFailures += 1;
    if (this.consecutivePermanentFailures < this.failureThreshold) return false;
    this.open(now);
    return true;
  }

  private open(now: Date): void {
    this.retryAtValue = new Date(now.getTime() + this.cooldownMilliseconds);
  }

  private reset(): void {
    this.consecutivePermanentFailures = 0;
    this.retryAtValue = null;
  }
}
