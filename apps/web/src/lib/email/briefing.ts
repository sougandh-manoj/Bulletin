import "server-only";

import {
  NEWS_CATEGORY_LABELS,
  type BriefingTheme,
  type NewsCategory,
  type SupportedLanguage,
} from "@/config/product";

import {
  escapeHtml,
  normalizedHttpUrl,
  safeHttpUrl,
  type BriefingSource,
} from "./briefing-shared";

export type StoredBriefingStory = {
  position: number;
  category: NewsCategory;
  headline: string;
  summary: string;
  whyItMatters: string;
  isUpdate: boolean;
  sources: readonly BriefingSource[];
};

export type StoredBriefingEmailInput = {
  language: SupportedLanguage;
  theme: BriefingTheme;
  scheduledFor: string;
  timezone: string;
  subscriberName: string;
  manageUrl: string;
  stories: readonly StoredBriefingStory[];
};

type Copy = {
  subject: string;
  brief: string;
  stories: (count: number) => string;
  why: string;
  sources: string;
  update: string;
  empty: string;
  prepared: (name: string) => string;
  manage: string;
  original: string;
};

const COPY: Record<SupportedLanguage, Copy> = {
  en: {
    subject: "Your Bulletin",
    brief: "Personal news briefing",
    stories: (count) => `${count} ${count === 1 ? "story" : "stories"}`,
    why: "Why it matters",
    sources: "Sources",
    update: "Update",
    empty: "No meaningful updates matched your preferences during this briefing period.",
    prepared: (name) => `Exclusively prepared for ${name}.`,
    manage: "Manage briefing",
    original: "Read original article",
  },
  hi: {
    subject: "आपका बुलेटिन",
    brief: "आपका निजी समाचार संक्षेप",
    stories: (count) => `${count} समाचार`,
    why: "यह क्यों महत्वपूर्ण है",
    sources: "स्रोत",
    update: "अपडेट",
    empty: "इस ब्रीफिंग अवधि में आपकी पसंद से मेल खाने वाला कोई महत्वपूर्ण अपडेट नहीं मिला।",
    prepared: (name) => `${name} के लिए विशेष रूप से तैयार किया गया।`,
    manage: "ब्रीफिंग प्रबंधित करें",
    original: "मूल लेख पढ़ें",
  },
  ml: {
    subject: "നിങ്ങളുടെ ബുള്ളറ്റിൻ",
    brief: "നിങ്ങളുടെ സ്വകാര്യ വാർത്താ സംക്ഷിപ്തം",
    stories: (count) => `${count} വാർത്ത${count === 1 ? "" : "കൾ"}`,
    why: "ഇത് എന്തുകൊണ്ട് പ്രധാനമാണ്",
    sources: "ഉറവിടങ്ങൾ",
    update: "പുതുക്കൽ",
    empty: "ഈ ബ്രീഫിംഗ് കാലയളവിൽ നിങ്ങളുടെ മുൻഗണനകളുമായി പൊരുത്തപ്പെടുന്ന പ്രധാനപ്പെട്ട പുതുക്കലുകളൊന്നുമില്ല.",
    prepared: (name) => `${name}-നായി മാത്രമായി തയ്യാറാക്കിയത്.`,
    manage: "ബ്രീഫിംഗ് നിയന്ത്രിക്കുക",
    original: "മൂല ലേഖനം വായിക്കുക",
  },
};

const LOCALE: Record<SupportedLanguage, string> = {
  en: "en-IN",
  hi: "hi-IN",
  ml: "ml-IN",
};

type Palette = {
  page: string;
  card: string;
  ink: string;
  copy: string;
  muted: string;
  accent: string;
  accentSoft: string;
  divider: string;
  source: string;
  serif: boolean;
  label: string;
};

const PALETTES: Record<BriefingTheme, Palette> = {
  "light-editorial": {
    page: "#f6f3ec",
    card: "#fcfaf5",
    ink: "#15191d",
    copy: "#42474d",
    muted: "#676b70",
    accent: "#315f91",
    accentSoft: "#e5edf5",
    divider: "#d8d4cb",
    source: "#eef1f3",
    serif: true,
    label: "Light Editorial",
  },
  "dark-intelligence": {
    page: "#eaf2fa",
    card: "#f7fbff",
    ink: "#111820",
    copy: "#34404c",
    muted: "#637182",
    accent: "#1769aa",
    accentSoft: "#dcecf9",
    divider: "#c8d8e7",
    source: "#e5eff8",
    serif: false,
    label: "Signal Brief",
  },
  "midnight-brief": {
    page: "#090909",
    card: "#111111",
    ink: "#f3ece3",
    copy: "#b8b3af",
    muted: "#8f8a86",
    accent: "#70b5ff",
    accentSoft: "#182535",
    divider: "#343434",
    source: "#1b1b1b",
    serif: true,
    label: "Midnight Brief",
  },
  "amber-brief": {
    page: "#fff9e8",
    card: "#fffdf7",
    ink: "#171a1f",
    copy: "#565b61",
    muted: "#777b80",
    accent: "#b87500",
    accentSoft: "#fff2c9",
    divider: "#e8cf8e",
    source: "#f2eee3",
    serif: true,
    label: "Amber Brief",
  },
};

export function formatBriefingDate(input: {
  value: string;
  timezone: string;
  language: SupportedLanguage;
  weekday?: boolean;
}) {
  const date = new Date(input.value);
  if (Number.isNaN(date.getTime())) throw new Error("invalid-briefing-date");
  return new Intl.DateTimeFormat(LOCALE[input.language], {
    ...(input.weekday ? { weekday: "long" as const } : {}),
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: input.timezone,
  }).format(date);
}

function sourceHtml(source: BriefingSource, palette: Palette) {
  const name = escapeHtml(source.name);
  const url = safeHttpUrl(source.url);
  const iconUrl = safeHttpUrl(source.iconUrl);
  const icon = iconUrl
    ? `<td width="20" style="padding:0 7px 0 0">${url ? `<a href="${url}" style="display:block;text-decoration:none">` : ""}<img src="${iconUrl}" width="20" height="20" alt="" style="display:block;width:20px;height:20px;border:0;border-radius:50%;object-fit:cover">${url ? "</a>" : ""}</td>`
    : "";
  const linkedName = url
    ? `<a href="${url}" style="color:${palette.copy};text-decoration:underline">${name}</a>`
    : name;
  return `<table role="presentation" cellspacing="0" cellpadding="0" style="display:inline-table;margin:0 12px 10px 0;vertical-align:top">
    <tr><td><table role="presentation" cellspacing="0" cellpadding="0" bgcolor="${palette.source}" style="background:${palette.source};border:1px solid ${palette.divider};border-radius:999px;border-collapse:separate"><tr>${icon}<td style="padding:${icon ? "6px 11px 6px 0" : "6px 11px"};color:${palette.copy};font:700 11px/1.2 Arial,sans-serif">${linkedName}</td></tr></table></td></tr>
  </table>`;
}

function storyHtml(
  story: StoredBriefingStory,
  palette: Palette,
  copy: Copy,
) {
  const sources = story.sources.map((source) => sourceHtml(source, palette)).join("");
  const titleFont = palette.serif ? "Georgia,'Times New Roman',serif" : "Arial,Helvetica,sans-serif";
  return `<tr><td bgcolor="${palette.card}" style="padding:0 46px 42px;background:${palette.card}">
    <div style="height:1px;margin:0 0 30px;background:${palette.divider};font-size:1px;line-height:1px">&nbsp;</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>
      <td style="color:${palette.accent};font:700 11px/1.4 Arial,sans-serif;letter-spacing:1.7px;text-transform:uppercase">${escapeHtml(NEWS_CATEGORY_LABELS[story.category])}</td>
      <td align="right" style="color:${palette.muted};font:700 11px/1.4 Arial,sans-serif;letter-spacing:1.4px;text-transform:uppercase">${story.isUpdate ? escapeHtml(copy.update) : String(story.position).padStart(2, "0")}</td>
    </tr></table>
    <h2 style="margin:20px 0 0;color:${palette.ink};font-family:${titleFont};font-size:30px;font-weight:${palette.serif ? 500 : 750};line-height:1.18">${escapeHtml(story.headline)}</h2>
    <p style="margin:20px 0 0;color:${palette.copy};font:16px/1.65 Arial,Helvetica,sans-serif">${escapeHtml(story.summary)}</p>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" bgcolor="${palette.accentSoft}" style="margin-top:24px;background:${palette.accentSoft};border-collapse:separate"><tr>
      <td width="3" bgcolor="${palette.accent}" style="width:3px;background:${palette.accent};font-size:1px">&nbsp;</td>
      <td style="padding:18px 20px;color:${palette.copy};font:15px/1.55 Arial,Helvetica,sans-serif"><strong style="color:${palette.accent}">${escapeHtml(copy.why)}:</strong> ${escapeHtml(story.whyItMatters)}</td>
    </tr></table>
    <p style="margin:23px 0 10px;color:${palette.muted};font:700 10px/1.4 Arial,sans-serif;letter-spacing:1.5px;text-transform:uppercase">${escapeHtml(copy.sources)}</p>
    ${sources}
  </td></tr>`;
}

function plainText(input: StoredBriefingEmailInput, copy: Copy, dateLabel: string) {
  const stories = input.stories.length === 0
    ? [copy.empty]
    : input.stories.map((story) => {
      const sources = story.sources.map((source) => {
        const url = normalizedHttpUrl(source.url);
        return url ? `${source.name}: ${url}` : source.name;
      });
      return [
        `${story.position}. ${NEWS_CATEGORY_LABELS[story.category]}${story.isUpdate ? ` · ${copy.update}` : ""}`,
        story.headline,
        story.summary,
        `${copy.why}: ${story.whyItMatters}`,
        `${copy.sources}:`,
        ...sources,
      ].join("\n");
    });
  return [
    "BULLETIN",
    dateLabel,
    `${copy.stories(input.stories.length)} · ${copy.brief}`,
    "",
    ...stories.flatMap((story) => [story, ""]),
    copy.prepared(input.subscriberName),
    `${copy.manage}: ${normalizedHttpUrl(input.manageUrl) ?? ""}`,
  ].join("\n").trim();
}

export function buildStoredBriefingEmail(input: StoredBriefingEmailInput) {
  const copy = COPY[input.language];
  const palette = PALETTES[input.theme];
  const dateLabel = formatBriefingDate({
    value: input.scheduledFor,
    timezone: input.timezone,
    language: input.language,
    weekday: true,
  });
  const subjectDate = formatBriefingDate({
    value: input.scheduledFor,
    timezone: input.timezone,
    language: input.language,
  });
  const manageUrl = safeHttpUrl(input.manageUrl);
  if (!manageUrl) throw new Error("invalid-management-url");
  const stories = input.stories.length > 0
    ? input.stories.map((story) => storyHtml(story, palette, copy)).join("")
    : `<tr><td bgcolor="${palette.card}" style="padding:0 46px 46px;background:${palette.card}"><div style="height:1px;margin:0 0 30px;background:${palette.divider}">&nbsp;</div><p style="margin:0;color:${palette.copy};font:16px/1.65 Arial,sans-serif">${escapeHtml(copy.empty)}</p></td></tr>`;
  const headlineFont = palette.serif ? "Georgia,'Times New Roman',serif" : "Arial,Helvetica,sans-serif";
  const fixedScheme = input.theme === "midnight-brief" ? "dark only" : "light only";

  return {
    subject: `${copy.subject} - ${subjectDate}`,
    text: plainText(input, copy, dateLabel),
    html: `<!doctype html>
<html lang="${input.language}" style="background:${palette.page};color-scheme:${fixedScheme};supported-color-schemes:${fixedScheme}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="${fixedScheme}"><meta name="supported-color-schemes" content="${fixedScheme}">
<style>:root{color-scheme:${fixedScheme}!important;supported-color-schemes:${fixedScheme}!important}html,body{margin:0!important;background:${palette.page}!important}.brief-page{background:${palette.page}!important;background-image:linear-gradient(${palette.page},${palette.page})!important}.brief-card{background:${palette.card}!important;background-image:linear-gradient(${palette.card},${palette.card})!important}@media (prefers-color-scheme:dark){.brief-page{background:${palette.page}!important;background-image:linear-gradient(${palette.page},${palette.page})!important}.brief-card{background:${palette.card}!important;background-image:linear-gradient(${palette.card},${palette.card})!important}}@media screen and (max-width:640px){.brief-frame{padding:12px 7px!important}.brief-pad{padding-left:24px!important;padding-right:24px!important}.brief-title{font-size:34px!important}}</style></head>
<body bgcolor="${palette.page}" class="brief-page" style="margin:0;background:${palette.page};color:${palette.ink};font-family:Arial,sans-serif">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(copy.stories(input.stories.length))} · ${escapeHtml(dateLabel)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" bgcolor="${palette.page}" class="brief-page"><tr><td align="center" class="brief-frame" style="padding:32px 14px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" bgcolor="${palette.card}" class="brief-card" style="width:100%;max-width:640px;background:${palette.card};border:1px solid ${palette.divider};border-collapse:separate">
<tr><td class="brief-pad" style="padding:38px 46px 0"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td style="color:${palette.ink};font:800 18px/1.2 Arial,sans-serif;letter-spacing:${input.theme === "light-editorial" ? "1px" : "6px"};text-transform:${input.theme === "light-editorial" ? "none" : "uppercase"}">BULLETIN</td><td align="right" style="color:${palette.muted};font:13px/1.3 Arial,sans-serif">${escapeHtml(dateLabel)}</td></tr></table></td></tr>
<tr><td class="brief-pad" style="padding:62px 46px 42px"><p style="margin:0;color:${palette.accent};font:700 11px/1.5 Arial,sans-serif;letter-spacing:2px;text-transform:uppercase">${escapeHtml(palette.label)}</p><h1 class="brief-title" style="margin:22px 0 0;color:${palette.ink};font-family:${headlineFont};font-size:42px;font-weight:${palette.serif ? 500 : 800};line-height:1.08">${escapeHtml(copy.brief)}</h1><p style="margin:20px 0 0;color:${palette.copy};font:17px/1.6 Arial,sans-serif">${escapeHtml(copy.stories(input.stories.length))}</p></td></tr>
${stories}
<tr><td class="brief-pad" bgcolor="${palette.card}" style="padding:10px 46px 38px;background:${palette.card};border-top:1px solid ${palette.divider};color:${palette.muted};font:12px/1.7 Arial,sans-serif"><p style="margin:20px 0 8px">${escapeHtml(copy.prepared(input.subscriberName))}</p><a href="${manageUrl}" style="color:${palette.accent};font-weight:700;text-decoration:underline">${escapeHtml(copy.manage)}</a></td></tr>
</table></td></tr></table></body></html>`,
  };
}
