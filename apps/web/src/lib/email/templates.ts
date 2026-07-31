import { PRODUCT } from "@/config/product";

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character] ?? character);
}

function emailFrame(input: {
  eyebrow: string;
  heading: string;
  body: string;
  actionLabel: string;
  actionUrl: string;
  note: string;
}) {
  const actionUrl = escapeHtml(input.actionUrl);
  return `<!doctype html>
<html lang="en" style="background-color:#f6f3ec;color-scheme:light only;supported-color-schemes:light only">
  <head>
    <meta charset="utf-8">
    <meta name="color-scheme" content="light only">
    <meta name="supported-color-schemes" content="light only">
    <style>
      :root { color-scheme: light only !important; supported-color-schemes: light only !important; }
      html, body { margin: 0 !important; background-color: #f6f3ec !important; }
      .bulletin-page { background-color: #f6f3ec !important; background-image: linear-gradient(#f6f3ec, #f6f3ec) !important; }
      .bulletin-card { background-color: #fcfaf5 !important; background-image: linear-gradient(#fcfaf5, #fcfaf5) !important; }
      .bulletin-ink { color: #15191d !important; -webkit-text-fill-color: #15191d !important; }
      .bulletin-muted { color: #5e6267 !important; -webkit-text-fill-color: #5e6267 !important; }
      .bulletin-blue { color: #315f91 !important; -webkit-text-fill-color: #315f91 !important; }
      .bulletin-button { background-color: #15191d !important; background-image: linear-gradient(#15191d, #15191d) !important; }
      .bulletin-button-link { color: #ffffff !important; -webkit-text-fill-color: #ffffff !important; }
      @media (prefers-color-scheme: dark) {
        .bulletin-page { background-color: #f6f3ec !important; background-image: linear-gradient(#f6f3ec, #f6f3ec) !important; }
        .bulletin-card { background-color: #fcfaf5 !important; background-image: linear-gradient(#fcfaf5, #fcfaf5) !important; }
        .bulletin-ink { color: #15191d !important; -webkit-text-fill-color: #15191d !important; }
        .bulletin-muted { color: #5e6267 !important; -webkit-text-fill-color: #5e6267 !important; }
        .bulletin-blue { color: #315f91 !important; -webkit-text-fill-color: #315f91 !important; }
        .bulletin-button { background-color: #15191d !important; background-image: linear-gradient(#15191d, #15191d) !important; }
        .bulletin-button-link { color: #ffffff !important; -webkit-text-fill-color: #ffffff !important; }
      }
    </style>
  </head>
  <body bgcolor="#f6f3ec" class="bulletin-page" style="margin:0;background-color:#f6f3ec;background-image:linear-gradient(#f6f3ec,#f6f3ec);color:#15191d;font-family:Arial,sans-serif;color-scheme:light only;supported-color-schemes:light only">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" bgcolor="#f6f3ec" class="bulletin-page" style="background-color:#f6f3ec;background-image:linear-gradient(#f6f3ec,#f6f3ec)">
      <tr><td align="center" bgcolor="#f6f3ec" class="bulletin-page" style="padding:36px 16px;background-color:#f6f3ec;background-image:linear-gradient(#f6f3ec,#f6f3ec)">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" bgcolor="#fcfaf5" class="bulletin-card" style="max-width:600px;background-color:#fcfaf5;background-image:linear-gradient(#fcfaf5,#fcfaf5);border:1px solid #d8d4cb">
          <tr><td bgcolor="#fcfaf5" class="bulletin-card bulletin-ink" style="padding:32px 34px;background-color:#fcfaf5;background-image:linear-gradient(#fcfaf5,#fcfaf5);border-bottom:1px solid #d8d4cb;color:#15191d;font-family:Georgia,serif;font-size:32px;font-weight:700">${PRODUCT.name}</td></tr>
          <tr><td bgcolor="#fcfaf5" class="bulletin-card" style="padding:38px 34px;background-color:#fcfaf5;background-image:linear-gradient(#fcfaf5,#fcfaf5)">
            <p class="bulletin-blue" style="margin:0 0 12px;color:#315f91;font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase">${escapeHtml(input.eyebrow)}</p>
            <h1 class="bulletin-ink" style="margin:0 0 20px;color:#15191d;font-family:Georgia,serif;font-size:36px;line-height:1.08">${escapeHtml(input.heading)}</h1>
            <p class="bulletin-muted" style="margin:0 0 28px;color:#5e6267;font-size:16px;line-height:1.7">${escapeHtml(input.body)}</p>
            <table role="presentation" cellspacing="0" cellpadding="0"><tr><td bgcolor="#15191d" class="bulletin-button" style="background-color:#15191d;background-image:linear-gradient(#15191d,#15191d)">
              <a href="${actionUrl}" class="bulletin-button-link" style="display:inline-block;padding:15px 22px;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none">${escapeHtml(input.actionLabel)}</a>
            </td></tr></table>
            <p class="bulletin-muted" style="margin:28px 0 0;color:#5e6267;font-size:13px;line-height:1.6">${escapeHtml(input.note)}</p>
          </td></tr>
          <tr><td bgcolor="#fcfaf5" class="bulletin-card bulletin-muted" style="padding:22px 34px;background-color:#fcfaf5;background-image:linear-gradient(#fcfaf5,#fcfaf5);border-top:1px solid #d8d4cb;color:#5e6267;font-size:12px;line-height:1.6">If you did not request this, you can safely ignore it. Bulletin never asks for a password.</td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

export function buildOwnerAccessEmail(accessUrl: string) {
  return {
    subject: "Bulletin owner operations access",
    text: [
      "Use the one-time link below to open Bulletin owner operations.",
      "",
      accessUrl,
      "",
      "This link expires after 15 minutes and is invalidated when a newer link is requested.",
      "If you did not request this, you can safely ignore it.",
    ].join("\n"),
    html: emailFrame({
      eyebrow: "Owner-only operations",
      heading: "Open Bulletin operations",
      body: "Use this one-time link to inspect delivery health, workers, alerts, and encrypted backup status.",
      actionLabel: "Open owner operations",
      actionUrl: accessUrl,
      note: "This private link expires after 15 minutes and must not be forwarded.",
    }),
  };
}

export function buildOwnerAlertEmail(input: { title: string; operationsUrl: string }) {
  return {
    subject: "Bulletin operations alert",
    text: [
      input.title,
      "",
      "Open owner operations for safe diagnostic details:",
      input.operationsUrl,
      "",
      "This alert contains no subscriber identity or private management link.",
    ].join("\n"),
    html: emailFrame({
      eyebrow: "High-severity operations alert",
      heading: input.title,
      body: "Open owner operations to inspect the deduplicated safe diagnostic record.",
      actionLabel: "Open owner operations",
      actionUrl: input.operationsUrl,
      note: "Alert emails contain no subscriber identity, credentials, or private subscriber-management URLs.",
    }),
  };
}
