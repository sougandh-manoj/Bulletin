import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/env/server", () => ({
  getSecureAccessEnvironment: () => ({
    APP_ENV: "test",
    EMAIL_TRANSPORT: "test",
    LOG_LEVEL: "info",
  }),
  getServerEnvironment: () => ({ LOG_LEVEL: "info" }),
}));

import {
  isSmtpDeliveryAccepted,
  sendOwnerAccessEmail,
} from "@/lib/email/mailer";

describe("safe automated email transport", () => {
  afterEach(() => vi.restoreAllMocks());

  it("accepts a test message without network delivery or sensitive logging", async () => {
    const write = vi.spyOn(console, "info").mockImplementation(() => undefined);
    await expect(
      sendOwnerAccessEmail(
        "recipient@example.invalid",
        "https://bulletin.example/internal/access/exchange?t=private-test-token",
      ),
    ).resolves.toBeUndefined();

    const logs = write.mock.calls.flat().join(" ");
    expect(logs).toContain('"transport":"test"');
    expect(logs).not.toContain("recipient@example.invalid");
    expect(logs).not.toContain("private-test-token");
  });

  it("claims SMTP delivery only when the server accepted a recipient", () => {
    expect(isSmtpDeliveryAccepted({ accepted: ["recipient@example.invalid"] }))
      .toBe(true);
    expect(isSmtpDeliveryAccepted({ accepted: [], rejected: ["recipient@example.invalid"] }))
      .toBe(false);
    expect(isSmtpDeliveryAccepted({})).toBe(false);
  });
});
