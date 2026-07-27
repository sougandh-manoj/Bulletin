import { beforeEach, describe, expect, it, vi } from "vitest";

import { buildManagementUrl, signManagementClaims } from "@/lib/security/crypto";

const secret = "management-test-secret-with-at-least-32-characters";
const mocks = vi.hoisted(() => ({
  findSubscriberForManagement: vi.fn(),
  enforceRateLimit: vi.fn(),
  establishSubscriberSession: vi.fn(),
}));

vi.mock("@/data/subscribers", () => ({ findSubscriberForManagement: mocks.findSubscriberForManagement }));
vi.mock("@/env/server", () => ({
  getSecureAccessEnvironment: () => ({
    MANAGEMENT_LINK_SIGNING_SECRET: secret,
    LOG_LEVEL: "error",
  }),
  getServerEnvironment: () => ({ LOG_LEVEL: "error" }),
}));
vi.mock("@/lib/security/rate-limit", () => ({ enforceRateLimit: mocks.enforceRateLimit }));
vi.mock("@/lib/security/session", () => ({ establishSubscriberSession: mocks.establishSubscriberSession }));

import { GET as GET_LEGACY } from "@/app/access/manage/route";
import { GET as GET_TICKET } from "@/app/access/manage/[ticket]/route";

const claims = {
  publicReference: "0d196f88-54e6-4ab0-badf-6f33709ba8d2",
  tokenVersion: 4,
  expiresAt: 2_000_000_000,
};

describe("management-link exchange", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Date, "now").mockReturnValue(1_900_000_000_000);
    mocks.enforceRateLimit.mockResolvedValue(true);
    mocks.findSubscriberForManagement.mockResolvedValue({ id: "subscriber-1", status: "active", token_version: 4 });
    mocks.establishSubscriberSession.mockResolvedValue(undefined);
  });

  it("validates the signature/version and redirects to a clean URL", async () => {
    const url = buildManagementUrl("https://bulletin.example", claims, secret);
    const ticket = new URL(url).pathname.split("/").at(-1) ?? "";
    const response = await GET_TICKET(
      new Request(url),
      { params: Promise.resolve({ ticket }) },
    );
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://bulletin.example/manage");
    expect(response.headers.get("location")).not.toMatch(/[?&](s|r|v|e)=/);
    expect(mocks.establishSubscriberSession).toHaveBeenCalledWith({ subscriberId: "subscriber-1", tokenVersion: 4 });
  });

  it("keeps old query-based links valid while newer emails use path tickets", async () => {
    const legacyUrl = new URL("https://bulletin.example/access/manage");
    legacyUrl.searchParams.set("r", claims.publicReference);
    legacyUrl.searchParams.set("v", String(claims.tokenVersion));
    legacyUrl.searchParams.set("e", String(claims.expiresAt));
    legacyUrl.searchParams.set("s", signManagementClaims(claims, secret));

    const response = await GET_LEGACY(new Request(legacyUrl));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://bulletin.example/manage");
  });

  it("rejects a tampered signature before creating a session", async () => {
    const url = new URL(buildManagementUrl("https://bulletin.example", claims, secret));
    url.searchParams.set("s", `x${url.searchParams.get("s")?.slice(1)}`);
    const response = await GET_TICKET(
      new Request(url),
      { params: Promise.resolve({ ticket: "tampered-ticket" }) },
    );
    expect(response.headers.get("location")).toContain("state=invalid");
    expect(mocks.findSubscriberForManagement).not.toHaveBeenCalled();
    expect(mocks.establishSubscriberSession).not.toHaveBeenCalled();
  });

  it("rejects a revoked token version", async () => {
    mocks.findSubscriberForManagement.mockResolvedValue({ id: "subscriber-1", status: "active", token_version: 5 });
    const url = buildManagementUrl("https://bulletin.example", claims, secret);
    const ticket = new URL(url).pathname.split("/").at(-1) ?? "";
    const response = await GET_TICKET(
      new Request(url),
      { params: Promise.resolve({ ticket }) },
    );
    expect(response.headers.get("location")).toContain("state=invalid");
    expect(mocks.establishSubscriberSession).not.toHaveBeenCalled();
  });
});
