import { describe, expect, it } from "vitest";
import { AI_CONSENT_VERSION, buildStoredAiConsent, householdAiAllowed, readAiConsent } from "./consent";

describe("readAiConsent", () => {
  it("is unset when nothing was ever stored", () => {
    expect(readAiConsent(undefined)).toBe("unset");
    expect(readAiConsent({})).toBe("unset");
    expect(readAiConsent({ ai_consent: "yes" })).toBe("unset");
  });

  it("reads a granted or declined answer", () => {
    expect(readAiConsent({ ai_consent: buildStoredAiConsent("granted") })).toBe("granted");
    expect(readAiConsent({ ai_consent: buildStoredAiConsent("declined") })).toBe("declined");
  });

  it("asks again when the answer was given to an older disclosure", () => {
    const old = { status: "granted", version: AI_CONSENT_VERSION - 1, at: "2026-01-01T00:00:00Z" };
    expect(readAiConsent({ ai_consent: old })).toBe("unset");
  });

  it("ignores malformed values", () => {
    expect(readAiConsent({ ai_consent: { status: "maybe", version: AI_CONSENT_VERSION } })).toBe("unset");
    expect(readAiConsent({ ai_consent: { status: "granted" } })).toBe("unset");
  });
});

describe("householdAiAllowed", () => {
  it("needs at least one member to have agreed", () => {
    expect(householdAiAllowed([])).toBe(false);
    expect(householdAiAllowed(["unset", "declined"])).toBe(false);
    expect(householdAiAllowed(["declined", "granted"])).toBe(true);
  });
});
