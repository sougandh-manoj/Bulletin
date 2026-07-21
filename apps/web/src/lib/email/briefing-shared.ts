export type BriefingSource = {
  iconUrl?: string;
  name: string;
  url?: string;
};

export type BriefingStory = {
  category: string;
  headline: string;
  summary: string;
  whyItMatters: string;
  sources: readonly BriefingSource[];
  url?: string;
};

export type BriefingEmailInput = {
  dateLabel: string;
  timeLabel: string;
  greeting: string;
  introduction?: string;
  stories: readonly BriefingStory[];
  manageUrl?: string;
};

export function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character] ?? character);
}

export function normalizedHttpUrl(value: string | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

export function safeHttpUrl(value: string | undefined) {
  const url = normalizedHttpUrl(value);
  return url ? escapeHtml(url) : null;
}

export function buildBriefingPlainText(
  input: BriefingEmailInput,
  introduction: string,
) {
  const stories = input.stories.length === 0
    ? ["No meaningful updates matched your preferences during this briefing period."]
    : input.stories.map((story, index) => {
      const sources = story.sources.map((source) => {
        const url = normalizedHttpUrl(source.url);
        return url ? `${source.name} (${url})` : source.name;
      }).join(" · ");
      return [
        `${String(index + 1).padStart(2, "0")} · ${story.category.toUpperCase()}`,
        story.headline,
        story.summary,
        `Why it matters: ${story.whyItMatters}`,
        sources ? `Verified across: ${sources}` : "",
        normalizedHttpUrl(story.url) ?? "",
      ].filter(Boolean).join("\n");
    });
  const manageUrl = normalizedHttpUrl(input.manageUrl);

  return [
    `BULLETIN · ${input.dateLabel} · ${input.timeLabel}`,
    "PERSONAL INTELLIGENCE BRIEF",
    "",
    input.greeting,
    introduction,
    "",
    ...stories.flatMap((story) => [story, ""]),
    manageUrl ? `Manage your Bulletin: ${manageUrl}` : "",
  ].filter((line, index, lines) => line !== "" || lines[index - 1] !== "").join("\n").trim();
}
