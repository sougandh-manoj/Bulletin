import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ owner: vi.fn(), control: vi.fn(), cancel: vi.fn(), retry: vi.fn() }));
vi.mock("@/env/server", () => ({ getOwnerEnvironment: () => ({ APP_BASE_URL: "https://bulletin.example" }) }));
vi.mock("@/lib/security/admin-session", () => ({ getAuthenticatedOwner: mocks.owner }));
vi.mock("@/data/operations", () => ({ setOwnerControl: mocks.control, cancelOwnerDelivery: mocks.cancel, retryOwnerDelivery: mocks.retry }));

import { POST } from "./route";

function request(body: Record<string, string>, origin = "https://bulletin.example") {
  return new Request("https://bulletin.example/api/internal/owner/action", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });
}

describe("owner-only audited actions", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.owner.mockResolvedValue({ csrfToken: "csrf", session: {} }); });
  it("denies cross-origin and unauthenticated controls", async () => {
    expect((await POST(request({ action: "control", csrf: "csrf", control: "email-delivery-enabled", enabled: "false" }, "https://attacker.example"))).status).toBe(403);
    mocks.owner.mockResolvedValue(null);
    expect((await POST(request({ action: "control", csrf: "csrf", control: "email-delivery-enabled", enabled: "false" }))).status).toBe(401);
    expect(mocks.control).not.toHaveBeenCalled();
  });
  it("allows only a validated bounded control and passes a unique audit request", async () => {
    const response = await POST(request({ action: "control", csrf: "csrf", control: "delivery-worker-paused", enabled: "true" }));
    expect(response.status).toBe(303);
    expect(mocks.control).toHaveBeenCalledWith(expect.objectContaining({ control: "delivery-worker-paused", enabled: true, requestId: expect.any(String) }));
  });
  it("cannot express a resend-success action", async () => {
    const response = await POST(request({ action: "resend-success", csrf: "csrf", deliveryId: "00000000-0000-4000-8000-000000000001" }));
    expect(response.status).toBe(400);
    expect(mocks.retry).not.toHaveBeenCalled();
  });
});
