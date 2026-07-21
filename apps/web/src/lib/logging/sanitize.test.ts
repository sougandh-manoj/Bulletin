import { describe, expect, it } from "vitest";

import { sanitizeLogValue } from "@/lib/logging/sanitize";

describe("log sanitization", () => {
  it("redacts secrets, email addresses, and private URL parameters", () => {
    const sanitized = sanitizeLogValue({
      email: "person@example.com",
      token: "private-token",
      note: "Contact person@example.com",
      url: "https://bulletin.example/manage?signature=private#section",
    });

    expect(sanitized).toEqual({
      email: "[redacted]",
      token: "[redacted]",
      note: "Contact [redacted-email]",
      url: "https://bulletin.example/manage",
    });
  });

  it("handles circular metadata without failing", () => {
    const metadata: Record<string, unknown> = {};
    metadata.self = metadata;

    expect(sanitizeLogValue(metadata)).toEqual({ self: "[circular]" });
  });
});
