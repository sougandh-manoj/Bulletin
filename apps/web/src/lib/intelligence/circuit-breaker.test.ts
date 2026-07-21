import { describe, expect, it } from "vitest";

import { ProviderCircuitBreaker } from "@/lib/intelligence/circuit-breaker";

const at = new Date("2026-07-18T09:00:00Z");

describe("provider circuit breaker", () => {
  it("opens immediately for a missing model and recovers after cooldown", () => {
    const circuit = new ProviderCircuitBreaker();
    expect(circuit.recordFailure("provider-model-unavailable", at)).toBe(true);
    expect(() => circuit.assertAvailable(at)).toThrow(expect.objectContaining({
      code: "provider-circuit-open", retryable: true, retryAt: new Date("2026-07-18T09:15:00Z"),
    }));
    expect(() => circuit.assertAvailable(new Date("2026-07-18T09:15:00Z"))).not.toThrow();
  });

  it("opens after three repeated malformed outputs but ignores transient failures", () => {
    const circuit = new ProviderCircuitBreaker();
    expect(circuit.recordFailure("provider-malformed-output", at)).toBe(false);
    expect(circuit.recordFailure("provider-timeout", at)).toBe(false);
    expect(circuit.recordFailure("provider-malformed-output", at)).toBe(false);
    expect(circuit.recordFailure("provider-malformed-output", at)).toBe(false);
    expect(circuit.recordFailure("provider-malformed-output", at)).toBe(true);
  });
});
