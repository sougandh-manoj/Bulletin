import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  signInWithOAuth: vi.fn(),
}));

vi.mock("@/env/server", () => ({
  getSupabaseAuthEnvironment: () => ({
    APP_BASE_URL: "https://bulletin.example",
  }),
}));

vi.mock("@/lib/supabase/auth", () => ({
  getSupabaseAuthClient: async () => ({
    auth: {
      signInWithOAuth: mocks.signInWithOAuth,
    },
  }),
}));

import { GET } from "@/app/auth/sign-in/route";

describe("social OAuth sign-in", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.signInWithOAuth.mockResolvedValue({
      data: { url: "https://provider.example/authorize" },
      error: null,
    });
  });

  it("starts Google OAuth with account selection and a create callback", async () => {
    const response = await GET(
      new Request("https://bulletin.example/auth/sign-in?provider=google"),
    );

    expect(mocks.signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: {
        redirectTo: "https://bulletin.example/auth/callback?intent=create",
        queryParams: {
          access_type: "offline",
          prompt: "select_account",
        },
      },
    });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://provider.example/authorize",
    );
  });

  it("keeps Apple OAuth dormant until provider credentials are ready", async () => {
    const response = await GET(
      new Request(
        "https://bulletin.example/auth/sign-in?provider=apple&intent=manage",
      ),
    );

    expect(mocks.signInWithOAuth).not.toHaveBeenCalled();
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://bulletin.example/sign-in?intent=manage&provider=apple&state=coming-soon",
    );
  });

  it("does not expose unsupported social providers", async () => {
    await GET(
      new Request(
        "https://bulletin.example/auth/sign-in?provider=facebook&intent=manage",
      ),
    );

    expect(mocks.signInWithOAuth).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "google" }),
    );
  });

  it("returns to sign-in with a failed enabled provider and preserved intent", async () => {
    mocks.signInWithOAuth.mockResolvedValue({
      data: { url: null },
      error: new Error("provider unavailable"),
    });

    const response = await GET(
      new Request(
        "https://bulletin.example/auth/sign-in?provider=google&intent=manage",
      ),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://bulletin.example/sign-in?intent=manage&provider=google&state=unavailable",
    );
  });
});
