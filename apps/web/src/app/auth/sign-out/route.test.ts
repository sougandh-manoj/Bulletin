import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ signOut: vi.fn() }));

vi.mock("@/env/server", () => ({
  getSupabaseAuthEnvironment: () => ({ APP_BASE_URL: "https://bulletin.example" }),
}));
vi.mock("@/lib/supabase/auth", () => ({
  getSupabaseAuthClient: async () => ({ auth: { signOut: mocks.signOut } }),
}));

import { POST } from "@/app/auth/sign-out/route";

function request(origin = "https://bulletin.example") {
  return new Request("https://bulletin.example/auth/sign-out", {
    method: "POST",
    headers: { origin },
  });
}

describe("social auth sign-out", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.signOut.mockResolvedValue({ error: null });
  });

  it("signs out and returns to the home page", async () => {
    const response = await POST(request());

    expect(mocks.signOut).toHaveBeenCalledOnce();
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://bulletin.example/");
  });

  it("rejects cross-site logout requests", async () => {
    const response = await POST(request("https://attacker.example"));

    expect(response.status).toBe(403);
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it("returns to sign-in when Supabase cannot clear the session", async () => {
    mocks.signOut.mockResolvedValue({ error: new Error("sign-out failed") });

    const response = await POST(request());

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://bulletin.example/sign-in?intent=manage&state=logout-failed",
    );
  });
});
