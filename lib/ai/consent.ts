// AI data-sharing consent (App Store Review Guideline 5.1.1(i) / 5.1.2(i):
// an app must disclose where personal data goes and get permission before
// sharing it with a third-party AI service). The answer lives in the user's
// Supabase auth metadata, so it needs no database migration and travels with
// the account across devices.
//
// Three states: "unset" (never asked -- the app shows the consent screen),
// "granted", and "declined". Declining keeps the whole app working; only the
// AI-assisted parts fall back to their non-AI behavior.

/** Bump this when the disclosure changes in a way that needs a fresh yes. */
export const AI_CONSENT_VERSION = 1;

export const AI_CONSENT_METADATA_KEY = "ai_consent";

export type AiConsentStatus = "unset" | "granted" | "declined";

export interface StoredAiConsent {
  status: "granted" | "declined";
  version: number;
  at: string;
}

export function buildStoredAiConsent(status: "granted" | "declined", now: Date = new Date()): StoredAiConsent {
  return { status, version: AI_CONSENT_VERSION, at: now.toISOString() };
}

/** Reads the consent answer out of a user's metadata, tolerating any shape. */
export function readAiConsent(metadata: unknown): AiConsentStatus {
  if (!metadata || typeof metadata !== "object") return "unset";
  const raw = (metadata as Record<string, unknown>)[AI_CONSENT_METADATA_KEY];
  if (!raw || typeof raw !== "object") return "unset";
  const { status, version } = raw as { status?: unknown; version?: unknown };
  if (status !== "granted" && status !== "declined") return "unset";
  // An answer given to an older, different disclosure doesn't count.
  if (typeof version !== "number" || version < AI_CONSENT_VERSION) return "unset";
  return status;
}

/**
 * Background jobs (the daily brief and similar) run without a signed-in
 * user, so a household may use AI there only once at least one member has
 * said yes.
 */
export function householdAiAllowed(memberStatuses: AiConsentStatus[]): boolean {
  return memberStatuses.some((s) => s === "granted");
}
