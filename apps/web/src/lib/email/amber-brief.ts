import {
  buildBriefingPlainText,
  escapeHtml,
  safeHttpUrl,
  type BriefingEmailInput,
  type BriefingSource,
  type BriefingStory,
} from "./briefing-shared";

export type AmberBriefStory = BriefingStory;
export type AmberBriefEmailInput = BriefingEmailInput;

function storyHeadline(story: AmberBriefStory) {
  const headline = escapeHtml(story.headline);
  const url = safeHttpUrl(story.url);
  if (!url) return headline;
  return `<a href="${url}" class="amber-ink" style="color:#171a1f;-webkit-text-fill-color:#171a1f;text-decoration:none">${headline}</a>`;
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
      ? `<a href="${url}" class="amber-copy" style="color:#5c6066;-webkit-text-fill-color:#5c6066;text-decoration:none">${name}</a>`
      : name;
    return `<table role="presentation" cellspacing="0" cellpadding="0" style="display:inline-table;margin:0 10px 10px 0;vertical-align:top">
      <tr>
        <td>
          <table role="presentation" cellspacing="0" cellpadding="0" bgcolor="#f0f0f2" class="amber-source-pill" style="background-color:#f0f0f2;background-image:linear-gradient(#f0f0f2,#f0f0f2);border-radius:999px;border-collapse:separate">
            <tr>${icon}<td class="amber-copy" style="padding:${icon ? "5px 11px 5px 0" : "5px 11px"};color:#5c6066;-webkit-text-fill-color:#5c6066;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:700;line-height:1.2;white-space:nowrap">${sourceName}</td></tr>
          </table>
        </td>
      </tr>
      ${iconUrl && url ? `<tr><td style="padding-top:2px"><a href="${url}" class="amber-gold" style="color:#c98400;-webkit-text-fill-color:#c98400;font-family:Arial,Helvetica,sans-serif;font-size:10px;line-height:1.4;text-decoration:underline;text-underline-offset:2px">Read original article</a></td></tr>` : ""}
    </table>`;
  }).join("");
}

function storyMeta(story: AmberBriefStory, index: number) {
  const number = String(index + 1).padStart(2, "0");
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;table-layout:fixed">
    <tr>
      <td width="72%" style="width:72%">
        <table role="presentation" cellspacing="0" cellpadding="0">
          <tr>
            <td width="42" height="42" align="center" valign="middle" bgcolor="#fff2c9" class="amber-icon amber-gold-bg amber-gold" style="width:42px;height:42px;border-radius:50%;background-color:#fff2c9;background-image:linear-gradient(#fff2c9,#fff2c9);color:#c98400;-webkit-text-fill-color:#c98400;font-family:Arial,Helvetica,sans-serif;font-size:${index === 0 ? "10" : "15"}px;font-weight:700;line-height:42px">${index === 0 ? "AI" : number}</td>
            <td class="amber-gold" style="padding-left:18px;color:#c98400;-webkit-text-fill-color:#c98400;font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:700;letter-spacing:1.7px;line-height:1.4;text-transform:uppercase">${escapeHtml(story.category)}</td>
          </tr>
        </table>
      </td>
      <td width="28%" align="right" class="amber-gold" style="width:28%;color:#c98400;-webkit-text-fill-color:#c98400;font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:700;letter-spacing:1.5px;line-height:1.4;text-transform:uppercase;white-space:nowrap">Signal ${number}</td>
    </tr>
  </table>`;
}

function renderStory(story: AmberBriefStory, index: number) {
  const sources = storySources(story.sources);
  return `<tr>
    <td class="amber-content amber-card" bgcolor="#fffdf7" style="padding:0 52px 44px;background-color:#fffdf7;background-image:linear-gradient(#fffdf7,#fffdf7)">
      <div class="amber-divider" style="height:1px;margin:0 0 34px;background-color:#efd99d;background-image:linear-gradient(#efd99d,#efd99d);font-size:1px;line-height:1px">&nbsp;</div>
      ${storyMeta(story, index)}
      <h2 class="amber-story-title amber-ink" style="margin:30px 0 0;color:#171a1f;-webkit-text-fill-color:#171a1f;font-family:Georgia,'Times New Roman',serif;font-size:32px;font-weight:400;letter-spacing:-0.7px;line-height:1.16">${storyHeadline(story)}</h2>
      <p class="amber-copy" style="margin:23px 0 0;color:#5c6066;-webkit-text-fill-color:#5c6066;font-family:Arial,Helvetica,sans-serif;font-size:17px;line-height:1.65">${escapeHtml(story.summary)}</p>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" class="amber-why" bgcolor="#fff7de" style="width:100%;table-layout:fixed;margin-top:26px;overflow:hidden;border-radius:12px;background-color:#fff7de;background-image:linear-gradient(#fff7de,#fff7de);border-collapse:separate">
        <tr>
          <td width="3" bgcolor="#d39400" class="amber-accent-bg" style="width:3px;background-color:#d39400;background-image:linear-gradient(#d39400,#d39400);font-size:1px;line-height:1px">&nbsp;</td>
          <td class="amber-copy" style="padding:22px 24px;color:#565b61;-webkit-text-fill-color:#565b61;font-family:Georgia,'Times New Roman',serif;font-size:16px;line-height:1.55"><strong class="amber-gold" style="color:#c98400;-webkit-text-fill-color:#c98400;font-weight:700">Why it matters:</strong> ${escapeHtml(story.whyItMatters)}</td>
        </tr>
      </table>
      ${sources ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:24px"><tr><td width="25" height="25" align="center" valign="middle" class="amber-gold amber-check" style="width:25px;height:25px;border:1px solid #d39400;border-radius:50%;color:#c98400;-webkit-text-fill-color:#c98400;font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:800;line-height:25px">&#10003;</td><td class="amber-copy" style="padding-left:12px;color:#5c6066;-webkit-text-fill-color:#5c6066;font-family:Arial,Helvetica,sans-serif;font-size:10px;font-weight:700;letter-spacing:1.5px;line-height:1.4;text-transform:uppercase">Verified across</td></tr><tr><td>&nbsp;</td><td style="padding:10px 0 0 12px">${sources}</td></tr></table>` : ""}
    </td>
  </tr>`;
}

function renderEmptyBriefing() {
  return `<tr>
    <td class="amber-content amber-card" bgcolor="#fffdf7" style="padding:0 52px 52px;background-color:#fffdf7;background-image:linear-gradient(#fffdf7,#fffdf7)">
      <div class="amber-divider" style="height:1px;margin:0 0 34px;background-color:#efd99d;background-image:linear-gradient(#efd99d,#efd99d);font-size:1px;line-height:1px">&nbsp;</div>
      <p class="amber-copy" style="margin:0;color:#5c6066;-webkit-text-fill-color:#5c6066;font-family:Arial,Helvetica,sans-serif;font-size:17px;line-height:1.65">No meaningful updates matched your preferences during this briefing period.</p>
    </td>
  </tr>`;
}

export function buildAmberBriefEmail(input: AmberBriefEmailInput) {
  const introduction = input.introduction
    ?? `${input.stories.length || "High-signal"} ${input.stories.length === 1 ? "development" : "developments"} matched to your briefing profile.`;
  const manageUrl = safeHttpUrl(input.manageUrl);
  const stories = input.stories.length > 0
    ? input.stories.map(renderStory).join("")
    : renderEmptyBriefing();

  return {
    subject: `Your Bulletin · ${input.dateLabel}`,
    text: buildBriefingPlainText(input, introduction),
    html: `<!doctype html>
<html lang="en" style="background-color:#fff9e8;color-scheme:light only;supported-color-schemes:light only">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="color-scheme" content="light only">
    <meta name="supported-color-schemes" content="light only">
    <style>
      :root { color-scheme: light only !important; supported-color-schemes: light only !important; }
      html, body { margin: 0 !important; background-color: #fff9e8 !important; }
      .amber-page { background-color: #fff9e8 !important; background-image: linear-gradient(#fff9e8, #fff9e8) !important; }
      .amber-card { background-color: #fffdf7 !important; background-image: linear-gradient(#fffdf7, #fffdf7) !important; }
      .amber-ink { color: #171a1f !important; -webkit-text-fill-color: #171a1f !important; }
      .amber-copy { color: #5c6066 !important; -webkit-text-fill-color: #5c6066 !important; }
      .amber-gold { color: #c98400 !important; -webkit-text-fill-color: #c98400 !important; }
      .amber-gold-bg { background-color: #fff2c9 !important; background-image: linear-gradient(#fff2c9, #fff2c9) !important; }
      .amber-why { background-color: #fff7de !important; background-image: linear-gradient(#fff7de, #fff7de) !important; }
      .amber-accent-bg { background-color: #d39400 !important; background-image: linear-gradient(#d39400, #d39400) !important; }
      .amber-divider { background-color: #efd99d !important; background-image: linear-gradient(#efd99d, #efd99d) !important; }
      .amber-source-pill { background-color: #f0f0f2 !important; background-image: linear-gradient(#f0f0f2, #f0f0f2) !important; }
      @media (prefers-color-scheme: light), (prefers-color-scheme: dark) {
        .amber-page { background-color: #fff9e8 !important; background-image: linear-gradient(#fff9e8, #fff9e8) !important; }
        .amber-card { background-color: #fffdf7 !important; background-image: linear-gradient(#fffdf7, #fffdf7) !important; }
        .amber-ink { color: #171a1f !important; -webkit-text-fill-color: #171a1f !important; }
        .amber-copy { color: #5c6066 !important; -webkit-text-fill-color: #5c6066 !important; }
        .amber-gold { color: #c98400 !important; -webkit-text-fill-color: #c98400 !important; }
        .amber-gold-bg { background-color: #fff2c9 !important; background-image: linear-gradient(#fff2c9, #fff2c9) !important; }
        .amber-why { background-color: #fff7de !important; background-image: linear-gradient(#fff7de, #fff7de) !important; }
        .amber-accent-bg { background-color: #d39400 !important; background-image: linear-gradient(#d39400, #d39400) !important; }
        .amber-divider { background-color: #efd99d !important; background-image: linear-gradient(#efd99d, #efd99d) !important; }
        .amber-source-pill { background-color: #f0f0f2 !important; background-image: linear-gradient(#f0f0f2, #f0f0f2) !important; }
      }
      @media screen and (max-width: 640px) {
        .amber-frame { padding: 14px 8px !important; }
        .amber-card { border-radius: 22px !important; }
        .amber-header, .amber-content, .amber-footer { padding-left: 24px !important; padding-right: 24px !important; }
        .amber-masthead { font-size: 16px !important; letter-spacing: 4px !important; }
        .amber-date { font-size: 13px !important; }
        .amber-greeting { font-size: 36px !important; }
        .amber-story-title { font-size: 28px !important; }
        .amber-copy { font-size: 16px !important; }
      }
    </style>
  </head>
  <body bgcolor="#fff9e8" class="amber-page" style="margin:0;background-color:#fff9e8;background-image:linear-gradient(#fff9e8,#fff9e8);color:#171a1f;font-family:Arial,Helvetica,sans-serif;color-scheme:light only;supported-color-schemes:light only">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeHtml(introduction)}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" bgcolor="#fff9e8" class="amber-page" style="background-color:#fff9e8;background-image:linear-gradient(#fff9e8,#fff9e8)">
      <tr>
        <td align="center" bgcolor="#fff9e8" class="amber-frame amber-page" style="padding:34px 16px;background-color:#fff9e8;background-image:linear-gradient(#fff9e8,#fff9e8)">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" bgcolor="#fffdf7" class="amber-card" style="width:100%;max-width:640px;table-layout:fixed;overflow:hidden;background-color:#fffdf7;background-image:linear-gradient(#fffdf7,#fffdf7);border:1px solid #f0dfae;border-radius:30px">
            <tr>
              <td class="amber-header amber-card" bgcolor="#fffdf7" style="padding:48px 52px 0;background-color:#fffdf7;background-image:linear-gradient(#fffdf7,#fffdf7)">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;table-layout:fixed">
                  <tr>
                    <td width="62%" class="amber-masthead amber-ink" style="width:62%;color:#171a1f;-webkit-text-fill-color:#171a1f;font-family:Arial,Helvetica,sans-serif;font-size:18px;font-weight:750;letter-spacing:7px;line-height:1.2;text-transform:uppercase">BULLETIN</td>
                    <td width="38%" align="right" class="amber-date amber-copy" style="width:38%;color:#50545a;-webkit-text-fill-color:#50545a;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.2;white-space:nowrap">${escapeHtml(input.dateLabel)}</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td class="amber-content amber-card" bgcolor="#fffdf7" style="padding:76px 52px 48px;background-color:#fffdf7;background-image:linear-gradient(#fffdf7,#fffdf7)">
                <p class="amber-gold" style="margin:0;color:#c98400;-webkit-text-fill-color:#c98400;font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:700;letter-spacing:2.7px;line-height:1.5;text-transform:uppercase">Personal intelligence brief</p>
                <h1 class="amber-greeting amber-ink" style="margin:30px 0 0;color:#171a1f;-webkit-text-fill-color:#171a1f;font-family:Georgia,'Times New Roman',serif;font-size:44px;font-weight:400;letter-spacing:-1px;line-height:1.08">${escapeHtml(input.greeting)}</h1>
                <p class="amber-copy" style="margin:27px 0 0;color:#5c6066;-webkit-text-fill-color:#5c6066;font-family:Arial,Helvetica,sans-serif;font-size:18px;line-height:1.65">${escapeHtml(introduction)}</p>
              </td>
            </tr>
            ${stories}
            <tr>
              <td class="amber-footer amber-card amber-copy" bgcolor="#fffdf7" style="padding:4px 52px 42px;background-color:#fffdf7;background-image:linear-gradient(#fffdf7,#fffdf7);color:#777b80;-webkit-text-fill-color:#777b80;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.6">
                ${manageUrl ? `<a href="${manageUrl}" class="amber-copy" style="color:#5c6066;-webkit-text-fill-color:#5c6066;text-decoration:underline;text-underline-offset:3px">Manage your Bulletin</a>` : "Bulletin · Your personal news briefing"}
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
