import { describe, expect, it } from "vitest";

import { crossSourceDuplicateKind, evaluateEventConsistency, eventFingerprint, isMeaningfulEventUpdate, type EventFacts } from "@/lib/intelligence/deterministic";

function event(overrides: Partial<EventFacts> = {}): EventFacts {
  return {
    entities: { people: ["Asha Rao"], organizations: ["Example Agency"], locations: ["Kochi"] },
    geography: { countryCode: "IN", stateRegion: "Kerala", city: "Kochi" },
    eventTime: "2026-07-18T06:00:00Z", eventType: "policy-announcement",
    keyAction: "Agency announces grant", keyOutcome: "Applications open",
    importantNumbers: [{ label: "grant", value: "10", unit: "crore", qualifier: null }],
    ...overrides,
  };
}

describe("deterministic event identity", () => {
  it("accepts a same-type event only with factual time, place, or entity anchors", () => {
    expect(evaluateEventConsistency(event(), event()).decision).toBe("accept");
    expect(evaluateEventConsistency(
      event({ entities: { people: [], organizations: [], locations: [] }, eventTime: null, keyAction: null }),
      event({ entities: { people: [], organizations: [], locations: [] }, eventTime: null, keyAction: null }),
    ).decision).toBe("uncertain");
  });

  it("rejects semantically similar records with conflicting identity or numeric claims", () => {
    const result = evaluateEventConsistency(event(), event({
      entities: { people: ["Different Person"], organizations: ["Other Agency"], locations: ["Delhi"] },
      geography: { countryCode: "IN", stateRegion: "Delhi", city: "Delhi" },
      importantNumbers: [{ label: "grant", value: "20", unit: "crore", qualifier: null }],
    }));
    expect(result.decision).toBe("reject");
    expect(result.conflicts).toEqual(expect.arrayContaining(["state-region-mismatch", "principal-entity-mismatch", "numeric-conflict:grant"]));
  });

  it("creates stable fingerprints and identifies only material updates", () => {
    expect(eventFingerprint(event())).toBe(eventFingerprint(event()));
    expect(eventFingerprint(event())).not.toBe(eventFingerprint(event({ eventTime: "2026-07-19T06:00:00Z" })));
    expect(isMeaningfulEventUpdate(event({ keyOutcome: "Applications closed" }), event())).toBe(true);
    expect(isMeaningfulEventUpdate(event(), event())).toBe(false);
  });

  it("collapses exact and near-identical cross-publisher wording as one evidence unit", () => {
    expect(crossSourceDuplicateKind("Agency opens 10 crore grant", "Agency opens 10 crore grant")).toBe("cross-source-exact");
    expect(crossSourceDuplicateKind("Agency opens the 10 crore grant today", "Agency opens the 10 crore grant today.")).toBe("cross-source-exact");
    expect(crossSourceDuplicateKind("Agency opens grant", "Unrelated sports result")).toBeNull();
  });

  it("does not merge unrelated Hindi stories that only share a date, country, and generic feed category", () => {
    const rescue = event({
      entities: { people: [], organizations: [], locations: [] },
      geography: { countryCode: "IN", stateRegion: null, city: null },
      eventType: "business-economy-report",
      keyAction: "राजौरी में रेस्क्यू ऑपरेशन के दौरान लोगों को सुरक्षित निकाला गया",
      importantNumbers: [],
    });
    const food = event({
      entities: { people: [], organizations: [], locations: [] },
      geography: { countryCode: "IN", stateRegion: null, city: null },
      eventType: "business-economy-report",
      keyAction: "30 जुलाई से सावन में इन चीजों को खाने से मिलेगा फायदा",
      importantNumbers: [],
    });
    expect(evaluateEventConsistency(rescue, food).decision).not.toBe("accept");
  });

  it("ignores headline question words misidentified as organizations", () => {
    const cricket = event({
      entities: { people: [], organizations: ["Why", "Jasprit Bumrah"], locations: [] },
      geography: { countryCode: "IN", stateRegion: null, city: null },
      eventType: "india-report",
      keyAction: "Why did Jasprit Bumrah miss the match?",
      importantNumbers: [],
    });
    const court = event({
      entities: { people: [], organizations: ["Why", "Wangchuk's", "Court"], locations: [] },
      geography: { countryCode: "IN", stateRegion: null, city: null },
      eventType: "india-report",
      keyAction: "Why can't he choose his doctor, court asks in Wangchuk case",
      importantNumbers: [],
    });
    expect(evaluateEventConsistency(cricket, court).decision).toBe("reject");
  });

  it("still accepts independently worded reports with a distinctive shared entity and supporting facts", () => {
    const first = event({
      entities: { people: ["Sonam Wangchuk"], organizations: [], locations: [] },
      geography: { countryCode: "IN", stateRegion: "Delhi", city: null },
      eventType: "legal-report", keyAction: "Court hears Wangchuk petition", importantNumbers: [],
    });
    const second = event({
      entities: { people: ["Wangchuk's"], organizations: [], locations: [] },
      geography: { countryCode: "IN", stateRegion: "Delhi", city: null },
      eventType: "legal-report", keyAction: "Wangchuk case returns to court", importantNumbers: [],
    });
    expect(evaluateEventConsistency(first, second).decision).toBe("accept");
  });

  it("treats legacy empty entity objects as no entity evidence", () => {
    const legacy = event({ entities: {} as EventFacts["entities"], keyAction: "Different local report", importantNumbers: [] });
    expect(() => evaluateEventConsistency(event(), legacy)).not.toThrow();
    expect(evaluateEventConsistency(event(), legacy).decision).not.toBe("accept");
  });
});
