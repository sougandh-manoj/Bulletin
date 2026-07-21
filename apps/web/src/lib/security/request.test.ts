import { describe, expect, it } from "vitest";

import { hasValidSameOrigin, readJsonBody } from "@/lib/security/request";

describe("secure request handling", () => {
  it("accepts the configured or actual same origin", () => {
    const request = new Request("https://bulletin.example/api/secure/theme", {
      method: "POST",
      headers: { origin: "https://bulletin.example" },
    });
    expect(hasValidSameOrigin(request, "https://bulletin.example")).toBe(true);
  });

  it("rejects missing and cross-site origins", () => {
    expect(hasValidSameOrigin(new Request("https://bulletin.example/api"), "https://bulletin.example")).toBe(false);
    expect(hasValidSameOrigin(new Request("https://bulletin.example/api", { headers: { origin: "https://attacker.example" } }), "https://bulletin.example")).toBe(false);
  });

  it("parses bounded JSON and rejects oversized bodies", async () => {
    await expect(readJsonBody(new Request("https://bulletin.example/api", { method: "POST", body: '{"ok":true}' }), 100)).resolves.toEqual({ ok: true });
    await expect(readJsonBody(new Request("https://bulletin.example/api", { method: "POST", body: JSON.stringify({ value: "x".repeat(200) }) }), 100)).rejects.toThrow("request-too-large");
  });
});
