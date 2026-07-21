import { describe, expect, it } from "vitest";

import dataset from "@/lib/intelligence/fixtures/reviewed-event-pairs.json";
import { evaluateEventConsistency, isMeaningfulEventUpdate, type EventFacts } from "@/lib/intelligence/deterministic";

describe("manually reviewed Phase 7 event-pair dataset", () => {
  for (const fixture of dataset) {
    it(`${fixture.id}: ${fixture.review}`, () => {
      const left = fixture.left as EventFacts;
      const right = fixture.right as EventFacts;
      expect(evaluateEventConsistency(left, right).decision).toBe(fixture.expectedDecision);
      expect(isMeaningfulEventUpdate(left, right)).toBe(fixture.expectedMeaningfulUpdate);
    });
  }
});
