import { describe, expect, it } from "vitest";

import { acceptedFinalVerification, deterministicGrounding, localFinalVerification } from "@/lib/intelligence/grounding";
import type { SharedSummary } from "@/lib/intelligence/schemas";

const evidence = [{ id: "article-1", publisherName: "Public Agency", title: "Agency announces ₹10 crore grant", description: "Applications open on 18 July" }];
const summary: SharedSummary = {
  status: "ready", headline: "Agency opens 10 crore grant", summary: "The agency opened a 10 crore grant on 18 July. Applications are now open. The program supports local projects.",
  whyItMatters: "The grant funds local projects.", citationArticleIds: ["article-1"],
  attributionMarkers: [{ articleId: "article-1", publisherName: "Public Agency" }], uncertaintyMarkers: [], isUpdate: false,
};

describe("summary grounding", () => {
  it("accepts exact citations, attribution, and supported numbers", () => {
    expect(deterministicGrounding(summary, evidence)).toMatchObject({ passed: true, reasonCodes: [] });
  });

  it("accepts the two-sentence summary requested by the prompt", () => {
    const result = deterministicGrounding({
      ...summary,
      summary: "The agency opened a grant on 18 July. Applications are now open.",
    }, evidence);
    expect(result).toMatchObject({ passed: true, reasonCodes: [] });
  });

  it("rejects invented citations, wrong publishers, and numeric drift", () => {
    const result = deterministicGrounding({
      ...summary, summary: "The agency opened a 20 crore grant.", citationArticleIds: ["article-2"],
      attributionMarkers: [{ articleId: "article-2", publisherName: "Wrong Publisher" }],
    }, evidence);
    expect(result.passed).toBe(false);
    expect(result.reasonCodes).toEqual(expect.arrayContaining(["invalid-citation-id", "invalid-publisher-attribution", "unsupported-numeric-claim"]));
  });

  it("requires localization script and exact canonical citation/number preservation", () => {
    const localized = { ...summary, language: "hi" as const, summary: "एजेंसी ने 20 करोड़ का अनुदान खोला।" };
    expect(deterministicGrounding(localized, evidence, summary).reasonCodes).toContain("localization-numeric-drift");
    expect(deterministicGrounding({ ...localized, headline: "English only", summary: "English only" }, evidence, summary).reasonCodes).toContain("localization-script-mismatch");
  });

  it("rejects a non-English canonical output before provider verification", () => {
    const hindiCanonical = { ...summary, headline: "एजेंसी ने अनुदान खोला", summary: "एजेंसी ने अनुदान खोला। आवेदन खुले हैं।", whyItMatters: "यह स्थानीय परियोजनाओं के लिए उपयोगी है।" };
    expect(deterministicGrounding(hindiCanonical, evidence).reasonCodes).toContain("canonical-english-script-mismatch");
  });

  it("allows paraphrased sentences when the summary as a whole remains grounded", () => {
    const result = deterministicGrounding({
      ...summary,
      summary: "The agency opened a 10 crore grant on 18 July. People may now submit proposals. The funding is intended for community work.",
    }, evidence);
    expect(result.reasonCodes).not.toContain("unsupported-lexical-claim");
  });

  it("still rejects a wholly unrelated canonical summary", () => {
    const result = deterministicGrounding({
      ...summary,
      headline: "Astronauts plan an ocean mission",
      summary: "Astronauts discovered unusual minerals beneath a distant frozen ocean. Scientists are preparing a return mission.",
      whyItMatters: "The finding could reshape planetary exploration.",
    }, evidence);
    expect(result.reasonCodes).toContain("unsupported-lexical-claim");
  });

  it("passes only an empty, attribution-preserving final verification", () => {
    expect(acceptedFinalVerification({ status: "ready", passed: true, unsupportedClaims: [], invalidCitationIds: [], numericConflicts: [], uncertaintyPreserved: true, attributionPreserved: true })).toBe(true);
    expect(acceptedFinalVerification({ status: "ready", passed: true, unsupportedClaims: ["claim"], invalidCitationIds: [], numericConflicts: [], uncertaintyPreserved: true, attributionPreserved: true })).toBe(false);
  });

  it("turns deterministic grounding into the stored verification record", () => {
    expect(localFinalVerification(deterministicGrounding(summary, evidence))).toMatchObject({
      status: "ready", passed: true, unsupportedClaims: [], invalidCitationIds: [], numericConflicts: [],
      uncertaintyPreserved: true, attributionPreserved: true,
    });
  });
});
