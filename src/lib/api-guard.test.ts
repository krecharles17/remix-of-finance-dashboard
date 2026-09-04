import { describe, expect, it } from "vitest";

import { clampText, guardPublicAi, rateLimit, sameOrigin } from "./api-guard.server";

const req = (headers: Record<string, string> = {}) =>
  new Request("https://app.example.com/api/commentary", { method: "POST", headers });

describe("sameOrigin", () => {
  it("allows a same-origin request", () => {
    expect(sameOrigin(req({ origin: "https://app.example.com" }))).toBeNull();
    expect(sameOrigin(req({ referer: "https://app.example.com/dashboard" }))).toBeNull();
  });

  it("allows a request with no origin or referer", () => {
    expect(sameOrigin(req())).toBeNull();
  });

  it("rejects another origin and an unparseable header", () => {
    expect(sameOrigin(req({ origin: "https://evil.example" }))?.status).toBe(403);
    expect(sameOrigin(req({ origin: "not a url" }))?.status).toBe(403);
  });
});

describe("rateLimit", () => {
  it("allows ten requests a minute per client, then returns 429", () => {
    const headers = { "cf-connecting-ip": "203.0.113.10" };
    for (let i = 0; i < 10; i++) {
      expect(rateLimit(req(headers), "test-route")).toBeNull();
    }
    const blocked = rateLimit(req(headers), "test-route");
    expect(blocked?.status).toBe(429);
    expect(blocked?.headers.get("Retry-After")).toBe("60");
  });

  it("counts each client separately", () => {
    const route = "test-route-b";
    for (let i = 0; i < 10; i++) rateLimit(req({ "cf-connecting-ip": "198.51.100.1" }), route);
    expect(rateLimit(req({ "cf-connecting-ip": "198.51.100.2" }), route)).toBeNull();
  });

  it("counts each route separately", () => {
    const headers = { "cf-connecting-ip": "203.0.113.99" };
    for (let i = 0; i < 10; i++) rateLimit(req(headers), "route-one");
    expect(rateLimit(req(headers), "route-two")).toBeNull();
  });

  it("uses the first address in x-forwarded-for", () => {
    const route = "test-route-c";
    for (let i = 0; i < 10; i++) {
      rateLimit(req({ "x-forwarded-for": "192.0.2.5, 10.0.0.1" }), route);
    }
    expect(rateLimit(req({ "x-forwarded-for": "192.0.2.5, 10.0.0.9" }), route)?.status).toBe(429);
  });
});

describe("guardPublicAi", () => {
  it("applies the origin check before the rate limit", () => {
    expect(guardPublicAi(req({ origin: "https://evil.example" }), "combined")?.status).toBe(403);
    expect(guardPublicAi(req({ "cf-connecting-ip": "203.0.113.55" }), "combined")).toBeNull();
  });
});

describe("clampText", () => {
  it("trims, caps, and turns non-strings into an empty string", () => {
    expect(clampText("  hello  ", 10)).toBe("hello");
    expect(clampText("abcdefghij", 4)).toBe("abcd");
    expect(clampText(42, 10)).toBe("");
    expect(clampText(undefined, 10)).toBe("");
  });
});
