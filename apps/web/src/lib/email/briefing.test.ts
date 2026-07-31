import { describe, expect, it } from "vitest";

import { buildStoredBriefingEmail, formatBriefingDate } from "./briefing";

const base = {
  language: "en" as const,
  theme: "light-editorial" as const,
  scheduledFor: "2026-07-12T02:30:00.000Z",
  timezone: "Asia/Kolkata",
  subscriberName: "Asha",
  manageUrl: "https://bulletin.example/manage",
  stories: [
    {
      position: 1,
      category: "technology-ai" as const,
      headline: "Stored headline one",
      summary: "Sentence one. Sentence two. Sentence three. Sentence four.",
      whyItMatters: "Stored reason one.",
      isUpdate: true,
      sources: [
        { name: "Publisher One", url: "https://publisher-one.example/original", iconUrl: "https://publisher-one.example/icon.png" },
        { name: "Publisher Two", url: "https://publisher-two.example/report" },
      ],
    },
    {
      position: 2,
      category: "science" as const,
      headline: "Stored headline two",
      summary: "Second summary one. Second summary two. Second summary three.",
      whyItMatters: "Stored reason two.",
      isUpdate: false,
      sources: [{ name: "Publisher Three", url: "https://publisher-three.example/article" }],
    },
  ],
};

describe("Phase 9 stored briefing rendering", () => {
  it.each([
    ["light-editorial", "#f6f3ec", "Light Editorial"],
    ["dark-intelligence", "#eaf2fa", "Signal Brief"],
    ["midnight-brief", "#090909", "Midnight Brief"],
    ["amber-brief", "#fff9e8", "Amber Brief"],
  ] as const)("renders the recognizable %s theme with exact stored order", (theme, color, label) => {
    const email = buildStoredBriefingEmail({ ...base, theme });
    expect(email.html).toContain(color);
    expect(email.html).toContain(label);
    expect(email.html.indexOf("Stored headline one")).toBeLessThan(email.html.indexOf("Stored headline two"));
    expect(email.html).toContain("Sentence one. Sentence two. Sentence three. Sentence four.");
    expect(email.html).toContain("Update");
    expect(email.html).toContain("Exclusively prepared for Asha.");
    expect(email.html).toContain('href="https://publisher-one.example/original"');
    expect(email.html).toContain('src="https://publisher-one.example/icon.png"');
  });

  it("renders publisher icons only when stored and always preserves direct original links", () => {
    const email = buildStoredBriefingEmail(base);
    expect(email.html).toContain('src="https://publisher-one.example/icon.png"');
    expect(email.html).toMatch(/href="https:\/\/publisher-one\.example\/original"[^>]*>[\s\S]*?Publisher One<\/a>/);
    expect(email.html).toMatch(/href="https:\/\/publisher-one\.example\/original"[^>]*>[\s\S]*?<img src="https:\/\/publisher-one\.example\/icon\.png"/);
    expect(email.html).toContain('href="https://publisher-two.example/report"');
    expect(email.html).not.toContain("Publisher Two</a></td><td");
    expect(email.html).not.toContain("Read original article");
    expect(email.text).toContain("Publisher Three: https://publisher-three.example/article");
    expect(email.html).not.toMatch(/utm_|click[_-]?id|tracking/i);
  });

  it.each([
    "light-editorial",
    "dark-intelligence",
    "midnight-brief",
    "amber-brief",
  ] as const)("preserves NDTV.com attribution and its direct article link in %s", (theme) => {
    const url = "https://www.ndtv.com/india-news/example-story-123";
    const email = buildStoredBriefingEmail({
      ...base,
      theme,
      stories: [{
        ...base.stories[0],
        sources: [{ name: "NDTV.com", url }],
      }],
    });

    expect(email.html).toContain(`href="${url}"`);
    expect(email.html).toMatch(/href="https:\/\/www\.ndtv\.com\/india-news\/example-story-123"[^>]*>NDTV\.com<\/a>/);
    expect(email.text).toContain(`NDTV.com: ${url}`);
  });

  it.each([
    "light-editorial",
    "dark-intelligence",
    "midnight-brief",
    "amber-brief",
  ] as const)("does not mention NDTV when %s contains no NDTV source", (theme) => {
    const email = buildStoredBriefingEmail({ ...base, theme });

    expect(email.html).not.toMatch(/ndtv/i);
    expect(email.text).not.toMatch(/ndtv/i);
  });

  it.each([
    ["en", "Your Bulletin - 12 July 2026", "Sunday 12 July, 2026"],
    ["hi", "आपका बुलेटिन - 12 जुलाई 2026", "रविवार, 12 जुलाई 2026"],
    ["ml", "നിങ്ങളുടെ ബുള്ളറ്റിൻ - 2026, ജൂലൈ 12", "2026, ജൂലൈ 12, ഞായറാഴ്‌ച"],
  ] as const)("localizes date, subject, and labels for %s", (language, subject, date) => {
    const email = buildStoredBriefingEmail({ ...base, language });
    expect(email.subject).toBe(subject);
    expect(email.html).toContain(date);
    expect(email.html).toContain(`lang="${language}"`);
  });

  it("supports an honest zero-story HTML and plain-text briefing", () => {
    const email = buildStoredBriefingEmail({ ...base, stories: [] });
    expect(email.html).toContain("0 stories");
    expect(email.html).toContain("No meaningful updates matched your preferences");
    expect(email.text).toContain("No meaningful updates matched your preferences");
  });

  it("fails closed on invalid date/timezone input", () => {
    expect(() => formatBriefingDate({ value: "bad", timezone: "Asia/Kolkata", language: "en" })).toThrow();
    expect(() => buildStoredBriefingEmail({ ...base, timezone: "Not/A-Zone" })).toThrow();
  });
});
