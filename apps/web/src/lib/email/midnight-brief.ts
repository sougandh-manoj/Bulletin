import {
  buildBriefingPlainText,
  escapeHtml,
  safeHttpUrl,
  type BriefingEmailInput,
  type BriefingSource,
  type BriefingStory,
} from "./briefing-shared";

export type MidnightBriefStory = BriefingStory;
export type MidnightBriefEmailInput = BriefingEmailInput;

function storyHeadline(story: MidnightBriefStory) {
  const headline = escapeHtml(story.headline);
  const url = safeHttpUrl(story.url);
  if (!url) return headline;
  return `<a href="${url}" class="midnight-cream" style="color:#f3ece3;-webkit-text-fill-color:#f3ece3;text-decoration:none">${headline}</a>`;
}

function storySources(sources: readonly BriefingSource[]) {
  return sources.map((source) => {
    const name = escapeHtml(source.name);
    const url = safeHttpUrl(source.url);
    const iconUrl = safeHttpUrl(source.iconUrl);
    const icon = iconUrl
      ? `<td width="20" height="20" style="width:20px;height:20px;padding:0 7px 0 0"><img src="${iconUrl}" width="20" height="20" alt="" style="display:block;width:20px;height:20px;border:0;border-radius:50%;object-fit:cover"></td>`
      : "";
    const sourceName = !iconUrl && url
      ? `<a href="${url}" class="midnight-copy" style="color:#aaa5a1;-webkit-text-fill-color:#aaa5a1;text-decoration:none">${name}</a>`
      : name;
    return `<table role="presentation" cellspacing="0" cellpadding="0" style="display:inline-table;margin:0 10px 10px 0;vertical-align:top">
      <tr>
        <td>
          <table role="presentation" cellspacing="0" cellpadding="0" bgcolor="#1b1b1b" class="midnight-source-pill" style="background-color:#1b1b1b;background-image:linear-gradient(#1b1b1b,#1b1b1b);border:1px solid #2c2c2c;border-radius:999px;border-collapse:separate">
            <tr>${icon}<td class="midnight-copy" style="padding:${icon ? "5px 11px 5px 0" : "5px 11px"};color:#aaa5a1;-webkit-text-fill-color:#aaa5a1;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:700;line-height:1.2;white-space:nowrap">${sourceName}</td></tr>
          </table>
        </td>
      </tr>
      ${iconUrl && url ? `<tr><td style="padding-top:2px"><a href="${url}" class="midnight-blue" style="color:#70b5ff;-webkit-text-fill-color:#70b5ff;font-family:Arial,Helvetica,sans-serif;font-size:10px;line-height:1.4;text-decoration:underline;text-underline-offset:2px">Read original article</a></td></tr>` : ""}
    </table>`;
  }).join("");
}

function storyMeta(story: MidnightBriefStory, index: number) {
  if (index === 0) {
    return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0">
      <tr>
        <td class="midnight-blue" style="color:#70b5ff;-webkit-text-fill-color:#70b5ff;font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:700;letter-spacing:2px;line-height:1.4;text-transform:uppercase">${escapeHtml(story.category)}</td>
        <td align="right" class="midnight-muted" style="color:#8f8a86;-webkit-text-fill-color:#8f8a86;font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:600;letter-spacing:2px;line-height:1.4;text-transform:uppercase">Signal 01</td>
      </tr>
    </table>`;
  }

  return `<table role="presentation" cellspacing="0" cellpadding="0">
    <tr>
      <td class="midnight-blue" style="padding-right:12px;color:#70b5ff;-webkit-text-fill-color:#70b5ff;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.4">${String(index + 1).padStart(2, "0")}</td>
      <td class="midnight-border" style="padding:0 12px;border-left:1px solid #343434;color:#8f8a86;-webkit-text-fill-color:#8f8a86;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:600;letter-spacing:2px;line-height:1.4;text-transform:uppercase">${escapeHtml(story.category)}</td>
    </tr>
  </table>`;
}

function renderStory(story: MidnightBriefStory, index: number) {
  const sources = storySources(story.sources);
  return `<tr>
    <td class="midnight-content midnight-card" bgcolor="#111111" style="padding:0 52px 42px;background-color:#111111;background-image:linear-gradient(#111111,#111111)">
      <div class="midnight-border" style="height:1px;margin:0 0 34px;background-color:#303030;background-image:linear-gradient(#303030,#303030);font-size:1px;line-height:1px">&nbsp;</div>
      ${storyMeta(story, index)}
      <h2 class="midnight-story-title midnight-cream" style="margin:22px 0 0;color:#f3ece3;-webkit-text-fill-color:#f3ece3;font-family:Georgia,'Times New Roman',serif;font-size:31px;font-weight:400;letter-spacing:-0.6px;line-height:1.18">${storyHeadline(story)}</h2>
      <p class="midnight-copy" style="margin:22px 0 0;color:#aaa5a1;-webkit-text-fill-color:#aaa5a1;font-family:Arial,Helvetica,sans-serif;font-size:17px;line-height:1.65">${escapeHtml(story.summary)}</p>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" class="midnight-why midnight-border" style="margin-top:26px;border:1px solid #343434;border-radius:12px;border-collapse:separate">
        <tr>
          <td width="2" bgcolor="#69aff8" class="midnight-blue-bg" style="width:2px;background-color:#69aff8;background-image:linear-gradient(#69aff8,#69aff8);font-size:1px;line-height:1px">&nbsp;</td>
          <td class="midnight-copy" style="padding:22px 24px;color:#b8b3af;-webkit-text-fill-color:#b8b3af;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.55"><strong style="color:#c9c4bf;-webkit-text-fill-color:#c9c4bf">Why it matters:</strong> ${escapeHtml(story.whyItMatters)}</td>
        </tr>
      </table>
      ${sources ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:24px"><tr><td class="midnight-muted" style="color:#98938f;-webkit-text-fill-color:#98938f;font-family:Arial,Helvetica,sans-serif;font-size:10px;font-weight:700;letter-spacing:1.5px;line-height:1.4;text-transform:uppercase">Verified across</td></tr><tr><td style="padding-top:10px">${sources}</td></tr></table>` : ""}
    </td>
  </tr>`;
}

function renderEmptyBriefing() {
  return `<tr>
    <td class="midnight-content midnight-card" bgcolor="#111111" style="padding:0 52px 52px;background-color:#111111;background-image:linear-gradient(#111111,#111111)">
      <div class="midnight-border" style="height:1px;margin:0 0 34px;background-color:#303030;background-image:linear-gradient(#303030,#303030);font-size:1px;line-height:1px">&nbsp;</div>
      <p class="midnight-copy" style="margin:0;color:#aaa5a1;-webkit-text-fill-color:#aaa5a1;font-family:Arial,Helvetica,sans-serif;font-size:17px;line-height:1.65">No meaningful updates matched your preferences during this briefing period.</p>
    </td>
  </tr>`;
}

export function buildMidnightBriefEmail(input: MidnightBriefEmailInput) {
  const introduction = input.introduction
    ?? `${input.stories.length || "High-signal"} ${input.stories.length === 1 ? "development" : "developments"} prepared around your interests.`;
  const manageUrl = safeHttpUrl(input.manageUrl);
  const stories = input.stories.length > 0
    ? input.stories.map(renderStory).join("")
    : renderEmptyBriefing();

  return {
    subject: `Your Bulletin · ${input.dateLabel}`,
    text: buildBriefingPlainText(input, introduction),
    html: `<!doctype html>
<html lang="en" style="background-color:#090909;color-scheme:dark only;supported-color-schemes:dark only">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="color-scheme" content="dark only">
    <meta name="supported-color-schemes" content="dark only">
    <style>
      :root { color-scheme: dark only !important; supported-color-schemes: dark only !important; }
      html, body { margin: 0 !important; background-color: #090909 !important; }
      .midnight-page { background-color: #090909 !important; background-image: linear-gradient(#090909, #090909) !important; }
      .midnight-card { background-color: #111111 !important; background-image: linear-gradient(#111111, #111111) !important; }
      .midnight-cream { color: #f3ece3 !important; -webkit-text-fill-color: #f3ece3 !important; }
      .midnight-copy { color: #aaa5a1 !important; -webkit-text-fill-color: #aaa5a1 !important; }
      .midnight-muted { color: #8f8a86 !important; -webkit-text-fill-color: #8f8a86 !important; }
      .midnight-blue { color: #70b5ff !important; -webkit-text-fill-color: #70b5ff !important; }
      .midnight-blue-bg { background-color: #69aff8 !important; background-image: linear-gradient(#69aff8, #69aff8) !important; }
      .midnight-source-pill { background-color: #1b1b1b !important; background-image: linear-gradient(#1b1b1b, #1b1b1b) !important; }
      .midnight-border { border-color: #343434 !important; }
      @media (prefers-color-scheme: light), (prefers-color-scheme: dark) {
        .midnight-page { background-color: #090909 !important; background-image: linear-gradient(#090909, #090909) !important; }
        .midnight-card { background-color: #111111 !important; background-image: linear-gradient(#111111, #111111) !important; }
        .midnight-cream { color: #f3ece3 !important; -webkit-text-fill-color: #f3ece3 !important; }
        .midnight-copy { color: #aaa5a1 !important; -webkit-text-fill-color: #aaa5a1 !important; }
        .midnight-muted { color: #8f8a86 !important; -webkit-text-fill-color: #8f8a86 !important; }
        .midnight-blue { color: #70b5ff !important; -webkit-text-fill-color: #70b5ff !important; }
        .midnight-blue-bg { background-color: #69aff8 !important; background-image: linear-gradient(#69aff8, #69aff8) !important; }
        .midnight-source-pill { background-color: #1b1b1b !important; background-image: linear-gradient(#1b1b1b, #1b1b1b) !important; }
        .midnight-border { border-color: #343434 !important; }
      }
      @media screen and (max-width: 640px) {
        .midnight-frame { padding: 14px 8px !important; }
        .midnight-card { border-radius: 22px !important; }
        .midnight-header, .midnight-content, .midnight-footer { padding-left: 24px !important; padding-right: 24px !important; }
        .midnight-masthead { font-size: 16px !important; letter-spacing: 4px !important; }
        .midnight-date { font-size: 13px !important; }
        .midnight-greeting { font-size: 36px !important; }
        .midnight-story-title { font-size: 28px !important; }
        .midnight-copy { font-size: 16px !important; }
      }
    </style>
  </head>
  <body bgcolor="#090909" class="midnight-page" style="margin:0;background-color:#090909;background-image:linear-gradient(#090909,#090909);color:#f3ece3;font-family:Arial,Helvetica,sans-serif;color-scheme:dark only;supported-color-schemes:dark only">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeHtml(introduction)}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" bgcolor="#090909" class="midnight-page" style="background-color:#090909;background-image:linear-gradient(#090909,#090909)">
      <tr>
        <td align="center" bgcolor="#090909" class="midnight-frame midnight-page" style="padding:34px 16px;background-color:#090909;background-image:linear-gradient(#090909,#090909)">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" bgcolor="#111111" class="midnight-card" style="width:100%;max-width:640px;table-layout:fixed;overflow:hidden;background-color:#111111;background-image:linear-gradient(#111111,#111111);border:1px solid #383838;border-radius:28px">
            <tr>
              <td class="midnight-header midnight-card" bgcolor="#111111" style="padding:46px 52px 0;background-color:#111111;background-image:linear-gradient(#111111,#111111)">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;table-layout:fixed">
                  <tr>
                    <td width="62%" class="midnight-masthead midnight-cream" style="width:62%;color:#f3ece3;-webkit-text-fill-color:#f3ece3;font-family:Georgia,'Times New Roman',serif;font-size:18px;font-weight:700;letter-spacing:6px;line-height:1.2;text-transform:uppercase"><span class="midnight-blue" style="display:inline-block;margin-right:15px;color:#70b5ff;-webkit-text-fill-color:#70b5ff;font-family:Arial,sans-serif;font-size:20px;letter-spacing:0;vertical-align:1px">&bull;</span>BULLETIN</td>
                    <td width="38%" align="right" class="midnight-date midnight-muted" style="width:38%;color:#8f8a86;-webkit-text-fill-color:#8f8a86;font-family:Georgia,'Times New Roman',serif;font-size:17px;line-height:1.2;white-space:nowrap">${escapeHtml(input.dateLabel)} &middot; ${escapeHtml(input.timeLabel)}</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td class="midnight-content midnight-card" bgcolor="#111111" style="padding:72px 52px 46px;background-color:#111111;background-image:linear-gradient(#111111,#111111)">
                <p class="midnight-muted" style="margin:0;color:#8f8a86;-webkit-text-fill-color:#8f8a86;font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:600;letter-spacing:3px;line-height:1.5;text-transform:uppercase">Personal intelligence brief</p>
                <h1 class="midnight-greeting midnight-cream" style="margin:30px 0 0;color:#f3ece3;-webkit-text-fill-color:#f3ece3;font-family:Georgia,'Times New Roman',serif;font-size:42px;font-weight:400;letter-spacing:-1px;line-height:1.1">${escapeHtml(input.greeting)}</h1>
                <p class="midnight-copy" style="margin:26px 0 0;color:#aaa5a1;-webkit-text-fill-color:#aaa5a1;font-family:Arial,Helvetica,sans-serif;font-size:18px;line-height:1.65">${escapeHtml(introduction)}</p>
              </td>
            </tr>
            ${stories}
            <tr>
              <td class="midnight-footer midnight-card midnight-muted" bgcolor="#111111" style="padding:4px 52px 42px;background-color:#111111;background-image:linear-gradient(#111111,#111111);color:#77736f;-webkit-text-fill-color:#77736f;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.6">
                ${manageUrl ? `<a href="${manageUrl}" class="midnight-muted" style="color:#8f8a86;-webkit-text-fill-color:#8f8a86;text-decoration:underline;text-underline-offset:3px">Manage your Bulletin</a>` : "Bulletin · Your personal news briefing"}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`,
  };
}
