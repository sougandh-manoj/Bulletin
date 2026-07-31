import { renderToStaticMarkup } from "react-dom/server";
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
  loadTodaysDeliveredBriefing: mocks.load,
}));
vi.mock("@/services/delivery", () => ({
  buildDeliveryEmailFromContext: mocks.render,
}));
vi.mock("@/env/server", () => ({
  getSecureAccessEnvironment: () => ({ APP_BASE_URL: "https://bulletin.example" }),
  getServerEnvironment: () => ({ LOG_LEVEL: "error" }),
}));

import TodaysBriefingPage from "./page";

const subscriber = {
  subscriberId: "00000000-0000-4000-8000-000000000001",
  name: "Reader",
  timezone: "Asia/Kolkata",
  deliveryTime: "09:00",
};

describe("today's briefing page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authenticate.mockResolvedValue({ user: { id: "auth-user" }, subscriber });
    mocks.load.mockResolvedValue(null);
    mocks.render.mockReturnValue({
      subject: "Your Bulletin",
      html: "<!doctype html><p>Exact delivered edition</p>",
    });
  });

  it("shows the scheduled delivery state before today's edition is sent", async () => {
    const html = renderToStaticMarkup(await TodaysBriefingPage());

    expect(html).toContain("Today&#x27;s briefing isn&#x27;t ready yet.");
    expect(html).toContain("Scheduled delivery:");
    expect(html).toContain("9:00 am");
    expect(html).toContain("will appear here as soon as it has been delivered");
  });

  it("embeds the exact delivered email when today's edition exists", async () => {
    mocks.load.mockResolvedValue({ deliveryId: "delivery-one" });

    const html = renderToStaticMarkup(await TodaysBriefingPage());

    expect(html).toContain("Today&#x27;s briefing.");
    expect(html).toContain("Exact delivered edition");
    expect(mocks.render).toHaveBeenCalledWith(
      { deliveryId: "delivery-one" },
      "https://bulletin.example/manage",
    );
  });

  it("shows a friendly retry state instead of a server error", async () => {
    mocks.load.mockRejectedValue(new Error("private database failure"));

    const html = renderToStaticMarkup(await TodaysBriefingPage());

    expect(html).toContain("Today&#x27;s briefing couldn&#x27;t be opened.");
    expect(html).toContain("email delivery is not affected");
  });
});
