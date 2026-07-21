import { describe, expect, it } from "vitest";

import { analyzeArticleLocally, type LocalArticleAnalysisInput } from "@/lib/intelligence/local-analysis";

function article(overrides: Partial<LocalArticleAnalysisInput> = {}): LocalArticleAnalysisInput {
  return {
    id: "article-1",
    title: "Fixture Agency opens 10 crore grant in Kochi",
    description: "Applications opened in Kochi on 18 July for local public-service projects.",
    publishedAt: "2026-07-18T06:00:00Z",
    language: "en",
    countryCode: "IN",
    stateRegion: "Kerala",
    city: "Kochi",
    feedCategories: ["government-schemes"],
    ...overrides,
  };
}

describe("local article analysis", () => {
  it("builds schema-valid canonical metadata without a model", () => {
    const result = analyzeArticleLocally(article());
    expect(result).toMatchObject({
      status: "ready",
      category: "government-schemes",
      eventTime: "2026-07-18T06:00:00.000Z",
      keyOutcome: null,
      factualDepth: 1,
      sourceIds: ["article-1"],
    });
    expect(result.importantNumbers.map((item) => item.value)).toEqual(expect.arrayContaining(["10 crore", "18"]));
  });

  it("does not mistake product public betas or basic cell research for sensitive claims", () => {
    const beta = analyzeArticleLocally(article({
      title: "Apple releases iOS 27 public beta with new photo tools",
      description: "The software beta adds interface and photo-editing features for supported phones.",
      feedCategories: ["technology-ai"],
      countryCode: null,
      stateRegion: null,
      city: null,
    }));
    const cells = analyzeArticleLocally(article({
      title: "Heat-stressed cells restart RNA splicing, study finds",
      description: "Researchers observed how nuclear stress bodies affect RNA splicing in laboratory cells.",
      feedCategories: ["science"],
      countryCode: null,
      stateRegion: null,
      city: null,
    }));
    expect(beta.sensitiveFlags).not.toContain("government");
    expect(cells.sensitiveFlags).not.toContain("health");
  });

  it("flags explicit high-risk reporting with narrow local rules", () => {
    const result = analyzeArticleLocally(article({
      title: "Court orders product recall after fatal safety hazard",
      description: "The court ruling follows a criminal investigation into deaths linked to the unsafe product.",
      feedCategories: ["world"],
    }));
    expect(result.sensitiveFlags).toEqual(expect.arrayContaining(["death", "legal", "public-safety", "safety"]));
  });

  it("quarantines explicit opinion and shallow malformed material locally", () => {
    expect(analyzeArticleLocally(article({ title: "Opinion: This policy is wrong" })).status).toBe("opinion");
    expect(analyzeArticleLocally(article({ title: "Short", description: null })).status).toBe("invalid-input");
  });

  it("uses article evidence instead of blindly inheriting a broad feed category", () => {
    const result = analyzeArticleLocally(article({
      title: "Startup raises funding round for artificial intelligence platform",
      description: "The founder said the venture capital investment will expand its software team.",
      feedCategories: ["business-economy"],
    }));
    expect(result.category).toBe("startups");
  });

  it("classifies medical reporting as health even when a feed calls it world or technology", () => {
    const eyeResearch = analyzeArticleLocally(article({
      title: "Scientists uncover eye's natural waste-clearance system",
      description: "The discovery may guide therapies for glaucoma and retinal diseases.",
      feedCategories: ["world"],
      countryCode: null,
      stateRegion: null,
      city: null,
    }));
    const clinicalAi = analyzeArticleLocally(article({
      title: "Artificial intelligence does not improve colorectal cancer screening",
      description: "A clinical study examined patients with Lynch syndrome.",
      feedCategories: ["technology-ai"],
      countryCode: null,
      stateRegion: null,
      city: null,
    }));
    expect(eyeResearch.category).toBe("health");
    expect(clinicalAi.category).toBe("health");
  });

  it("classifies quantum research as science rather than generic technology", () => {
    const result = analyzeArticleLocally(article({
      title: "Quantum entanglement without transport offers route around noisy channels",
      description: "Physics researchers demonstrated a method for generating entanglement between qubits.",
      feedCategories: ["technology-ai"],
      countryCode: null,
      stateRegion: null,
      city: null,
    }));
    expect(result.category).toBe("science");
  });

  it("classifies veterinary stem-cell reporting as health rather than finance", () => {
    const result = analyzeArticleLocally(article({
      title: "Scientists create canine red-blood-cell-like cells from induced stem cells",
      description: "The veterinary medicine study could improve transfusion availability for canine patients.",
      feedCategories: ["markets-personal-finance"],
      countryCode: null,
      stateRegion: null,
      city: null,
    }));
    expect(result.category).toBe("health");
  });
});
