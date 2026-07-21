import { describe, expect, it } from "vitest";

import { buildManagementEmail, buildVerificationEmail } from "@/lib/email/templates";

describe("transactional email templates", () => {
  it("makes verification scanner-safe and states its expiry", () => {
    const email = buildVerificationEmail("https://bulletin.example/access/verify?t=safe_test_token");
    expect(email.subject).toBe("Confirm your Bulletin");
    expect(email.text).toContain("Choose your theme");
    expect(email.text).toContain("expires after 24 hours");
    expect(email.html).toContain("Choose my theme");
    expect(email.html).toContain('<meta name="color-scheme" content="light only">');
    expect(email.html).toContain('<meta name="supported-color-schemes" content="light only">');
    expect(email.html).toContain('bgcolor="#f6f3ec"');
    expect(email.html).toContain('bgcolor="#fcfaf5"');
    expect(email.html).toContain("background-image:linear-gradient(#f6f3ec,#f6f3ec)");
  });

  it("builds a restrained management email without tracking markup", () => {
    const email = buildManagementEmail("https://bulletin.example/access/manage?r=public&amp=1");
    expect(email.subject).toBe("Manage your Bulletin");
    expect(email.text).toContain("expires after 15 minutes");
    expect(email.html).toContain("Manage briefing");
    expect(email.html).not.toMatch(/pixel|utm_|tracking/i);
    expect(email.html).toContain("&amp;amp=1");
  });
});
