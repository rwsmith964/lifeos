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
  const subject = `${inviterName} invited you to join ${householdName} on Famwise`;
  const text = `${inviterName} has invited you to join their household "${householdName}" on Famwise.\n\nAccept the invite: ${acceptUrl}\n\nThis link expires in 7 days. If you weren't expecting this, you can safely ignore it.`;

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

async function sendPlainEmail(params: { to: string; subject: string; text: string }): Promise<HouseholdInviteEmailResult> {
  const resend = getResendClient();
  if (!resend) {
    console.log(`[email:stub] to=${params.to} subject="${params.subject}" body="${params.text}"`);
    return { delivered: false, detail: "RESEND_API_KEY not configured — logged to console instead" };
  }
  const result = await resend.emails.send({ from: FROM_EMAIL, to: params.to, subject: params.subject, text: params.text });
  if (result.error) return { delivered: false, detail: result.error.message };
  return { delivered: true };
}

/** "Link our households so we can plan around each other" -- see app/link/[token]. */
export async function sendLinkInviteEmail(params: {
  to: string;
  inviterName: string;
  householdName: string;
  acceptUrl: string;
}): Promise<HouseholdInviteEmailResult> {
  return sendPlainEmail({
    to: params.to,
    subject: `${params.inviterName} wants to connect with you on Famwise`,
    text: `${params.inviterName} (${params.householdName}) invited you to connect on Famwise, so you can find times that work for both of you. You choose what you share, and you can disconnect any time.\n\nAccept: ${params.acceptUrl}\n\nThis link expires in 14 days. If you weren't expecting this, you can safely ignore it.`,
  });
}

/** An event invitation: works with or without a Famwise account (see app/rsvp/[token]). */
export async function sendEventInvitationEmail(params: {
  to: string;
  hostName: string;
  eventTitle: string;
  whenText: string;
  rsvpUrl: string;
  personalNote?: string;
}): Promise<HouseholdInviteEmailResult> {
  const note = params.personalNote ? `\n\nA note for you: ${params.personalNote}` : "";
  return sendPlainEmail({
    to: params.to,
    subject: `${params.hostName} invited you: ${params.eventTitle}`,
    text: `${params.hostName} invited you to ${params.eventTitle}.\n\nWhen: ${params.whenText}${note}\n\nSee the details and let them know if you can make it: ${params.rsvpUrl}`,
  });
}
