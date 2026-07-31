import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticate: vi.fn(),
  load: vi.fn(),
  render: vi.fn(),
}));

vi.mock("@/lib/security/authenticated-subscriber", () => ({
  getAuthenticatedBulletinSubscriber: mocks.authenticate,
}));
vi.mock("@/data/delivery", () => ({
  loadLatestDeliveredBriefing: mocks.load,
}));
vi.mock("@/services/delivery", () => ({
  buildDeliveryEmailFromContext: mocks.render,
}));
vi.mock("@/env/server", () => ({
  getSecureAccessEnvironment: () => ({ APP_BASE_URL: "https://bulletin.example" }),
}));

import { GET } from "./route";

const subscriber = {
  subscriberId: "00000000-0000-4000-8000-000000000001",
  name: "Reader",
  timezone: "Asia/Kolkata",
};

describe("today's briefing route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authenticate.mockResolvedValue({ user: { id: "auth-user" }, subscriber });
    mocks.load.mockResolvedValue({ deliveryId: "delivery-one" });
    mocks.render.mockReturnValue({ html: "<!doctype html><title>Your Bulletin</title><p>Exact sent edition</p>" });
  });

  it("requires a signed-in account", async () => {
    mocks.authenticate.mockResolvedValue(null);

    const response = await GET(new Request("https://bulletin.example/briefing/today"));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://bulletin.example/sign-in?intent=manage");
    expect(mocks.load).not.toHaveBeenCalled();
  });

  it("routes signed-in accounts without a Bulletin to onboarding", async () => {
    mocks.authenticate.mockResolvedValue({ user: { id: "auth-user" }, subscriber: null });

    const response = await GET(new Request("https://bulletin.example/briefing/today"));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://bulletin.example/onboarding");
  });

  it("routes subscribers without a sent edition to management", async () => {
    mocks.load.mockResolvedValue(null);

    const response = await GET(new Request("https://bulletin.example/briefing/today"));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://bulletin.example/manage");
  });

  it("renders the private sent edition inline", async () => {
    const response = await GET(new Request("https://bulletin.example/briefing/today"));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("x-robots-tag")).toContain("noindex");
    expect(await response.text()).toContain("Exact sent edition");
    expect(mocks.load).toHaveBeenCalledWith({
      owner: {
        subscriberId: subscriber.subscriberId,
        subscriberName: subscriber.name,
        timezone: subscriber.timezone,
      },
    });
    expect(mocks.render).toHaveBeenCalledWith(
      { deliveryId: "delivery-one" },
      "https://bulletin.example/manage",
    );
  });
});
