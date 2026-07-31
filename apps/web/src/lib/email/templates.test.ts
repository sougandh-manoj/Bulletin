import { describe, expect, it } from "vitest";

import { buildOwnerAccessEmail } from "@/lib/email/templates";

describe("transactional email templates", () => {
  it("keeps owner access private, expiring, and visually stable", () => {
    const email = buildOwnerAccessEmail(
      "https://bulletin.example/internal/access/exchange?t=safe_test_token",
    );
    expect(email.subject).toBe("Bulletin owner operations access");
    expect(email.text).toContain("expires after 15 minutes");
    expect(email.html).toContain("Open owner operations");
    expect(email.html).not.toMatch(/pixel|utm_|tracking/i);
    expect(email.html).toContain('<meta name="color-scheme" content="light only">');
    expect(email.html).toContain('<meta name="supported-color-schemes" content="light only">');
    expect(email.html).toContain('bgcolor="#f6f3ec"');
    expect(email.html).toContain('bgcolor="#fcfaf5"');
    expect(email.html).toContain("background-image:linear-gradient(#f6f3ec,#f6f3ec)");
  });
});
