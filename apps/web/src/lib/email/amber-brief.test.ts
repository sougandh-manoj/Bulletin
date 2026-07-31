import { describe, expect, it } from "vitest";

import { buildAmberBriefEmail } from "@/lib/email/amber-brief";

const sample = {
  dateLabel: "Friday · 11 July",
  timeLabel: "07:30",
  greeting: "Morning, Ananya.",
  introduction: "Three high-signal developments matched to your briefing profile.",
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
      category: "Health & Life Sciences",
      headline: "Breakthrough in low-cost diagnostics for early disease detection",
      summary: "A portable test shows strong accuracy in early trials.",
      whyItMatters: "Lower-cost screening could make earlier treatment possible for more people.",
      sources: [{ name: "Health Review" }],
    },
  ],
  manageUrl: "https://bulletin.example/manage",
} as const;

describe("Amber Brief email", () => {
  it("matches the warm gold reference without a masthead logo", () => {
    const email = buildAmberBriefEmail(sample);

    expect(email.subject).toBe("Your Bulletin · Friday · 11 July");
    expect(email.html).toContain("Friday · 11 July");
    expect(email.html).not.toContain("11.07 &middot; 07:30");
    expect(email.html).toContain('<meta name="color-scheme" content="light only">');
    expect(email.html).toContain('bgcolor="#fff9e8"');
    expect(email.html).toContain('bgcolor="#fffdf7"');
    expect(email.html).toContain(">BULLETIN</td>");
    expect(email.html).not.toMatch(/class="amber-masthead[^>]*>\s*<(?:img|svg|span)/);
    expect(email.html).toContain("Signal 01");
    expect(email.html).toContain("Why it matters:");
    expect(email.html).toContain("Verified across");
    expect(email.html).toContain('src="https://publisher-one.example/favicon.ico"');
    expect(email.html).toContain(">Read original article</a>");
    expect(email.html.indexOf("Publisher One")).toBeLessThan(email.html.indexOf("Read original article"));
    expect(email.html).toContain('href="https://publisher-two.example/story"');
    expect(email.html).toContain(">Publisher Two</a>");
    expect(email.html.match(/Read original article/g)).toHaveLength(1);
    expect(email.text).toContain("02 · HEALTH & LIFE SCIENCES");
  });

  it("escapes content and excludes unsafe links", () => {
    const email = buildAmberBriefEmail({
      ...sample,
      greeting: "Morning, <Reader>.",
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

    expect(email.html).toContain("Morning, &lt;Reader&gt;.");
    expect(email.html).toContain("A &lt;cleaner&gt; path");
    expect(email.html).toContain("Publisher &lt;One&gt;");
    expect(email.html).not.toContain("javascript:");
    expect(email.text).not.toContain("javascript:");
  });

  it("keeps the honest empty-briefing treatment", () => {
    const email = buildAmberBriefEmail({ ...sample, stories: [] });
    expect(email.html).toContain("No meaningful updates matched your preferences");
    expect(email.text).toContain("No meaningful updates matched your preferences");
  });
});
