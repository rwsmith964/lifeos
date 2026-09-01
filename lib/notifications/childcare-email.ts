// Childcare request email (D-060) — shares the Resend-with-console-stub
// pattern from lib/notifications/invite-email.ts (Section 12.9: works
// with zero third-party keys configured), but is its own standalone
// sender for the same reason invite-email.ts is: the recipient here is a
// childcare provider like "my mom" who is very often not tracked as a
// LifeOS person with a matching `people.email` on a household she's a
// member of — she's an arbitrary person row (possibly with no user
// account at all), not something channels/email.ts's `send()` (which
// looks up a person's email by person_id) is built to target.
import { Resend } from "resend";
import { formatCareDate } from "@/lib/childcare/format";
import { formatHandoverTime } from "@/lib/custody/schedule";

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? "lifeos@example.com";

let cachedClient: Resend | null | undefined;

function getResendClient(): Resend | null {
  if (cachedClient !== undefined) return cachedClient;
  const apiKey = process.env.RESEND_API_KEY;
  cachedClient = apiKey ? new Resend(apiKey) : null;
  return cachedClient;
}

export interface ChildcareRequestEmailResult {
  delivered: boolean;
  detail?: string;
}

/**
 * Sends (or console-stubs) the "can you watch the kids?" email. `previewUrl`
 * should already be the full absolute `/childcare-requests/[token]` URL —
 * building that from a request/header origin is the caller's job, same as
 * household-invite email's `acceptUrl` (see getSiteOrigin() in
 * lib/http/site-origin.ts).
 */
export async function sendChildcareRequestEmail(params: {
  to: string;
  requesterName: string;
  providerName: string;
  householdName: string;
  childNames: string[];
  careDate: string;
  careStartTime: string;
  careEndTime: string;
  eventTitle?: string | null;
  customNote?: string | null;
  driveMinutes?: number | null;
  previewUrl: string;
}): Promise<ChildcareRequestEmailResult> {
  const {
    to,
    requesterName,
    providerName,
    householdName,
    childNames,
    careDate,
    careStartTime,
    careEndTime,
    eventTitle,
    customNote,
    driveMinutes,
    previewUrl,
  } = params;

  const childList = childNames.length > 0 ? childNames.join(" and ") : "the kids";
  // D-114: never show the raw ISO date / 24-hour time columns straight from
  // Postgres to a person outside the app (this provider may have no LifeOS
  // account at all).
  const careDateLabel = formatCareDate(careDate);
  const careStartLabel = formatHandoverTime(careStartTime);
  const careEndLabel = formatHandoverTime(careEndTime);
  const subject = `${requesterName} is asking if you can watch ${childList} on ${careDateLabel}`;

  const lines = [
    `Hi ${providerName},`,
    "",
    `${requesterName} (${householdName} on LifeOS) is asking if you can provide childcare for ${childList} on ${careDateLabel}, from ${careStartLabel} to ${careEndLabel}.`,
  ];
  if (eventTitle) lines.push(`Reason: ${eventTitle}`);
  if (customNote) lines.push(`Note from ${requesterName}: "${customNote}"`);
  if (driveMinutes != null) {
    lines.push(`Estimated drive time to drop off: about ${driveMinutes} minutes.`);
  }
  lines.push("", `Review the details and accept or decline: ${previewUrl}`, "", "This link expires in 3 days.");
  const text = lines.join("\n");

  const resend = getResendClient();
  if (!resend) {
    console.log(`[email:stub] to=${to} subject=\"${subject}\" body=\"${text}\"`);
    return { delivered: false, detail: "RESEND_API_KEY not configured — logged to console instead" };
  }

  const result = await resend.emails.send({ from: FROM_EMAIL, to, subject, text });
  if (result.error) {
    return { delivered: false, detail: result.error.message };
  }
  return { delivered: true };
}
