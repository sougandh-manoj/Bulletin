import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  saveSubscriberPreferences: vi.fn(),
  saveSubscriberTheme: vi.fn(),
  pauseSubscriber: vi.fn(),
  resumeSubscriber: vi.fn(),
  deleteSubscriber: vi.fn(),
  getAuthenticatedSubscriber: vi.fn(),
  clearSubscriberSessionCookie: vi.fn(),
}));

vi.mock("@/data/subscribers", () => ({
  saveSubscriberPreferences: mocks.saveSubscriberPreferences,
  saveSubscriberTheme: mocks.saveSubscriberTheme,
  pauseSubscriber: mocks.pauseSubscriber,
  resumeSubscriber: mocks.resumeSubscriber,
  deleteSubscriber: mocks.deleteSubscriber,
}));
vi.mock("@/env/server", () => ({
  getSecureAccessEnvironment: () => ({ APP_BASE_URL: "https://bulletin.example", LOG_LEVEL: "error" }),
  getServerEnvironment: () => ({ LOG_LEVEL: "error" }),
}));
vi.mock("@/lib/security/session", () => ({
  getAuthenticatedSubscriber: mocks.getAuthenticatedSubscriber,
  clearSubscriberSessionCookie: mocks.clearSubscriberSessionCookie,
}));
vi.mock("@/services/access", () => ({
  isVersionConflict: (error: { code?: string }) => error?.code === "40001",
}));

import { POST as deletePost } from "@/app/api/secure/delete/route";
import { POST as deliveryPost } from "@/app/api/secure/delivery/route";
import { POST as preferencesPost } from "@/app/api/secure/preferences/route";
import { POST as themePost } from "@/app/api/secure/theme/route";

const csrfToken = "c".repeat(43);
const subscriber = {
  subscriber: { subscriberId: "subscriber-1" },
  csrfToken,
};
const preferences = {
  name: "Reader",
  countryCode: "IN",
  stateRegion: "Kerala",
  city: "Kochi",
  language: "en",
  categories: ["india"],
  customTopics: [],
  excludedTopics: [],
  storyCount: 3,
  frequency: "daily",
  deliveryTime: "08:00",
  timezone: "Asia/Kolkata",
  theme: "light-editorial",
};

function request(path: string, body: unknown, origin = "https://bulletin.example") {
  return new Request(`https://bulletin.example${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", origin },
    body: JSON.stringify(body),
  });
}

describe("authenticated Phase 4 mutations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAuthenticatedSubscriber.mockResolvedValue(subscriber);
    mocks.saveSubscriberPreferences.mockResolvedValue(8);
    mocks.saveSubscriberTheme.mockResolvedValue(9);
    mocks.pauseSubscriber.mockResolvedValue(undefined);
    mocks.resumeSubscriber.mockResolvedValue("2026-07-15T02:30:00Z");
    mocks.deleteSubscriber.mockResolvedValue(true);
  });

  it("saves the complete preference state with optimistic versioning", async () => {
    const response = await preferencesPost(request("/api/secure/preferences", {
      csrfToken,
      expectedVersion: 7,
      preferences,
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, version: 8 });
    expect(mocks.saveSubscriberPreferences).toHaveBeenCalledWith({ subscriberId: "subscriber-1", expectedVersion: 7, preferences });
  });

  it("reports a version conflict while leaving the database transaction rolled back", async () => {
    mocks.saveSubscriberPreferences.mockRejectedValue(Object.assign(new Error("conflict"), { code: "40001" }));
    const response = await preferencesPost(request("/api/secure/preferences", { csrfToken, expectedVersion: 7, preferences }));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ conflict: true });
  });

  it("saves theme through its immediate dedicated path", async () => {
    const response = await themePost(request("/api/secure/theme", { csrfToken, expectedVersion: 8, theme: "midnight-brief" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, version: 9 });
    expect(mocks.saveSubscriberTheme).toHaveBeenCalledWith({ subscriberId: "subscriber-1", expectedVersion: 8, theme: "midnight-brief" });
  });

  it("pauses immediately and resumes at the next normal slot", async () => {
    const paused = await deliveryPost(request("/api/secure/delivery", { csrfToken, action: "pause" }));
    expect(await paused.json()).toMatchObject({ status: "paused", nextDeliveryAt: null });
    expect(mocks.pauseSubscriber).toHaveBeenCalledWith("subscriber-1");

    const resumed = await deliveryPost(request("/api/secure/delivery", { csrfToken, action: "resume" }));
    expect(await resumed.json()).toMatchObject({ status: "active", nextDeliveryAt: "2026-07-15T02:30:00Z" });
    expect(mocks.resumeSubscriber).toHaveBeenCalledWith("subscriber-1");
  });

  it("rejects CSRF/cross-site preference mutations", async () => {
    const response = await preferencesPost(request("/api/secure/preferences", { csrfToken, expectedVersion: 7, preferences }, "https://attacker.example"));
    expect(response.status).toBe(403);
    expect(mocks.saveSubscriberPreferences).not.toHaveBeenCalled();
  });

  it("deletes only after explicit confirmation and prevents replay", async () => {
    const invalid = await deletePost(request("/api/secure/delete", { csrfToken, confirmation: "yes" }));
    expect(invalid.status).toBe(400);
    expect(mocks.deleteSubscriber).not.toHaveBeenCalled();

    const deleted = await deletePost(request("/api/secure/delete", { csrfToken, confirmation: "DELETE" }));
    expect(deleted.status).toBe(200);
    expect(mocks.deleteSubscriber).toHaveBeenCalledWith("subscriber-1");
    expect(mocks.clearSubscriberSessionCookie).toHaveBeenCalled();

    mocks.getAuthenticatedSubscriber.mockResolvedValue(null);
    const replay = await deletePost(request("/api/secure/delete", { csrfToken, confirmation: "DELETE" }));
    expect(replay.status).toBe(401);
    expect(mocks.deleteSubscriber).toHaveBeenCalledTimes(1);
  });
});
