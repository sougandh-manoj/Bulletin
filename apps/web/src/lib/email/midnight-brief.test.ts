import { describe, expect, it } from "vitest";

import { buildMidnightBriefEmail } from "@/lib/email/midnight-brief";

const sample = {
  dateLabel: "11.07",
  timeLabel: "07:30",
  greeting: "Good evening, Ananya.",
  introduction: "Three high-signal developments prepared around your interests.",
  stories: [
    {
      category: "Technology & AI",
      headline: "A cleaner path for the next generation of Indian startups",
      summary: "A new policy proposal focuses on research access and early-stage support.",
      whyItMatters: "The changes could make it easier for smaller teams to move from research to market.",
      url: "https://bulletin.example/stories/cleaner-path",
      sources: [
        {
          name: "Publisher One",
          url: "https://publisher-one.example/story",
          iconUrl: "https://publisher-one.example/favicon.ico",
        },
        { name: "Publisher Two", url: "https://publisher-two.example/story" },
      ],
    },
    {
      category: "Science",
      headline: "Researchers report progress in longer-term battery storage",
      summary: "A pilot project reports more stable storage across longer discharge cycles.",
      whyItMatters: "Longer storage windows could make renewable power easier to use after sunset.",
      sources: [{ name: "Science Review" }],
    },
  ],
  manageUrl: "https://bulletin.example/manage/access",
} as const;

describe("Midnight Brief email", () => {
  it("renders the supplied dark editorial design as responsive email-safe HTML", () => {
    const email = buildMidnightBriefEmail(sample);

    expect(email.subject).toBe("Your Bulletin · 11.07");
    expect(email.html).toContain('<meta name="color-scheme" content="dark only">');
    expect(email.html).toContain('bgcolor="#090909"');
    expect(email.html).toContain('bgcolor="#111111"');
    expect(email.html).toContain("Personal intelligence brief");
    expect(email.html).toContain("Signal 01");
    expect(email.html).toContain("Why it matters:");
    expect(email.html).toContain("Verified across");
    expect(email.html).toContain('src="https://publisher-one.example/favicon.ico"');
    expect(email.html).toContain(">Read original article</a>");
    expect(email.html.indexOf("Publisher One")).toBeLessThan(email.html.indexOf("Read original article"));
    expect(email.html).toContain('href="https://publisher-two.example/story"');
    expect(email.html).toContain(">Publisher Two</a>");
    expect(email.html.match(/Read original article/g)).toHaveLength(1);
    expect(email.html).toContain("02");
    expect(email.text).toContain("Good evening, Ananya.");
    expect(email.text).toContain("02 · SCIENCE");
  });

  it("escapes reader-facing content and refuses non-web links", () => {
    const email = buildMidnightBriefEmail({
      ...sample,
      greeting: "Hello <Reader>",
      stories: [{
        ...sample.stories[0],
        headline: "A <cleaner> path",
        url: "javascript:alert(1)",
        sources: [{
          name: "Publisher <One>",
          url: "javascript:alert(2)",
          iconUrl: "javascript:alert(3)",
        }],
      }],
    });

    expect(email.html).toContain("Hello &lt;Reader&gt;");
    expect(email.html).toContain("A &lt;cleaner&gt; path");
    expect(email.html).toContain("Publisher &lt;One&gt;");
    expect(email.html).not.toContain("javascript:");
    expect(email.text).not.toContain("javascript:");
  });

  it("keeps the honest empty-briefing treatment", () => {
    const email = buildMidnightBriefEmail({ ...sample, stories: [] });
    expect(email.html).toContain("No meaningful updates matched your preferences");
    expect(email.text).toContain("No meaningful updates matched your preferences");
  });
});
