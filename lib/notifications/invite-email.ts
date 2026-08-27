// Household invite email — deliberately NOT reusing lib/notifications/
// channels/email.ts's `send()`, which is keyed off an existing `person_id`
// and looks up that person's `.email` on file. A household invite targets
// an arbitrary email address typed into the invite form that has no
// corresponding `people` row (the whole point is inviting someone new) —
// so this is a standalone sender that shares only the same
// Resend-with-console-stub-fallback pattern (Section 12.9: "stub behind
// interface if no key", so `pnpm dev` and tests work with zero third-party
// keys configured).
import { Resend } from "resend";

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? "lifeos@example.com";

let cachedClient: Resend | null | undefined;

function getResendClient(): Resend | null {
  if (cachedClient !== undefined) return cachedClient;
  const apiKey = process.env.RESEND_API_KEY;
  cachedClient = apiKey ? new Resend(apiKey) : null;
  return cachedClient;
}

export interface HouseholdInviteEmailResult {
  delivered: boolean;
  detail?: string;
}

/**
 * Sends (or, with no RESEND_API_KEY configured, console-stubs) the
 * "you've been invited to join a household" email. `acceptUrl` should
 * already be the full absolute `/invite/[token]` URL — building that from
 * a request/header origin is the caller's job (see getSiteOrigin() in
 * app/actions.ts for the established pattern), not this helper's.
 */
export async function sendHouseholdInviteEmail(params: {
  to: string;
  householdName: string;
  inviterName: string;
  acceptUrl: string;
}): Promise<HouseholdInviteEmailResult> {
  const { to, householdName, inviterName, acceptUrl } = params;
  const subject = `${inviterName} invited you to join ${householdName} on LifeOS`;
  const text = `${inviterName} has invited you to join their household "${householdName}" on LifeOS.\n\nAccept the invite: ${acceptUrl}\n\nThis link expires in 7 days. If you weren't expecting this, you can safely ignore it.`;

  const resend = getResendClient();
  if (!resend) {
    console.log(`[email:stub] to=${to} subject="${subject}" body="${text}"`);
    return { delivered: false, detail: "RESEND_API_KEY not configured — logged to console instead" };
  }

  const result = await resend.emails.send({ from: FROM_EMAIL, to, subject, text });
  if (result.error) {
    return { delivered: false, detail: result.error.message };
  }
  return { delivered: true };
}
