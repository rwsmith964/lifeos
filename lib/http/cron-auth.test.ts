import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isCronAuthorized } from "./cron-auth";

function requestWithAuth(header?: string): Request {
  const headers = new Headers();
  if (header !== undefined) headers.set("authorization", header);
  return new Request("https://example.com/api/cron/brief", { headers });
}

describe("isCronAuthorized", () => {
  const originalSecret = process.env.CRON_SECRET;
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    if (originalSecret == null) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalSecret;
    // NODE_ENV is typed readonly on process.env in some TS lib configs;
    // Object.defineProperty sidesteps that without needing a cast at every
    // call site. Node's process.env proxy requires the descriptor to be
    // configurable, writable, AND enumerable, or the define throws.
    Object.defineProperty(process.env, "NODE_ENV", {
      value: originalNodeEnv,
      configurable: true,
      writable: true,
      enumerable: true,
    });
  });

  describe("with CRON_SECRET set", () => {
    beforeEach(() => {
      process.env.CRON_SECRET = "correct-horse-battery-staple";
    });

    it("authorizes a matching token", () => {
      expect(isCronAuthorized(requestWithAuth("Bearer correct-horse-battery-staple"))).toBe(true);
    });

    it("rejects a wrong token", () => {
      expect(isCronAuthorized(requestWithAuth("Bearer nope"))).toBe(false);
    });

    it("rejects a different-length token", () => {
      // Deliberately longer and shorter than the real secret, so this
      // exercises both branches of the length-mismatch short-circuit that
      // guards the timingSafeEqual call from throwing.
      expect(isCronAuthorized(requestWithAuth("Bearer correct-horse-battery-staple-but-longer"))).toBe(false);
      expect(isCronAuthorized(requestWithAuth("Bearer short"))).toBe(false);
    });

    it("rejects a missing authorization header", () => {
      expect(isCronAuthorized(requestWithAuth())).toBe(false);
    });

    it("rejects the bare secret without a Bearer prefix", () => {
      expect(isCronAuthorized(requestWithAuth("correct-horse-battery-staple"))).toBe(false);
    });
  });

  describe("with CRON_SECRET missing (regression guard for D-093 / D-146)", () => {
    beforeEach(() => {
      delete process.env.CRON_SECRET;
    });

    it("fails CLOSED in production — never silently re-authorize every request", () => {
      Object.defineProperty(process.env, "NODE_ENV", {
        value: "production",
        configurable: true,
        writable: true,
        enumerable: true,
      });
      expect(isCronAuthorized(requestWithAuth())).toBe(false);
      expect(isCronAuthorized(requestWithAuth("Bearer anything"))).toBe(false);
    });

    it("stays open in development so local dev needs no secret configured", () => {
      Object.defineProperty(process.env, "NODE_ENV", {
        value: "development",
        configurable: true,
        writable: true,
        enumerable: true,
      });
      expect(isCronAuthorized(requestWithAuth())).toBe(true);
    });
  });
});
