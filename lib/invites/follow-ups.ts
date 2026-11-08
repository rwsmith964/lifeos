// The questions the app asks after reading an invitation ("I noticed this is a
// wedding -- want a gift reminder with the registry details?"). Pure, so the
// wording and the rules for when to ask are testable; the UI just renders them.
import { format, parseISO } from "date-fns";
import type { InviteCategory, InviteExtraction } from "./extraction";

export interface InviteFollowUp {
  id: "gift" | "rsvp";
  question: string;
  /** Short hint shown under the question: what saying yes will add. */
  detail: string | null;
}

const GIFT_OCCASIONS: Partial<Record<InviteCategory, string>> = {
  wedding: "wedding",
  bridal_shower: "bridal shower",
  baby_shower: "baby shower",
  birthday: "birthday party",
  graduation: "graduation",
  anniversary: "anniversary party",
  housewarming: "housewarming",
  retirement: "retirement party",
};

const NO_GIFTS =
  /\b(no gifts?|gifts? (are |is )?(not |un)(necessary|needed|expected|required|wanted)|your presence is)/i;

export function occasionNoun(category: InviteCategory): string | null {
  return GIFT_OCCASIONS[category] ?? null;
}

export function registryMeansNoGifts(registryInfo: string | null): boolean {
  return !!registryInfo && NO_GIFTS.test(registryInfo);
}

export function buildInviteFollowUps(invite: InviteExtraction): InviteFollowUp[] {
  const out: InviteFollowUp[] = [];

  const noun = occasionNoun(invite.category);
  if (noun && !registryMeansNoGifts(invite.registryInfo)) {
    const article = /^[aeiou]/i.test(noun) ? "an" : "a";
    const hasRegistry = !!(invite.registryInfo || invite.registryUrl);
    out.push({
      id: "gift",
      question: `I noticed this is ${article} ${noun}. Would you like me to add a gift reminder${
        hasRegistry ? " with the registry information from the invitation" : ""
      }?`,
      detail: hasRegistry
        ? "The registry details are saved with the gift so they're there when it's time to shop."
        : "You can add what to buy later.",
    });
  }

  if (invite.rsvpBy) {
    let when = invite.rsvpBy;
    try {
      when = format(parseISO(invite.rsvpBy), "EEE, MMM d");
    } catch {
      // keep the raw string
    }
    out.push({
      id: "rsvp",
      question: `They want an RSVP by ${when}. Add a reminder for that day?`,
      detail: invite.rsvpContact ? `RSVP to: ${invite.rsvpContact}` : null,
    });
  }

  return out;
}

/** The text saved on the gift so the registry details travel with it. */
export function buildGiftNotes(invite: InviteExtraction): string {
  const parts: string[] = [];
  if (invite.registryInfo) parts.push(`Registry: ${invite.registryInfo}`);
  if (invite.registryUrl && !invite.registryInfo?.includes(invite.registryUrl)) parts.push(`Registry link: ${invite.registryUrl}`);
  parts.push(`From the invitation to ${invite.title}${invite.date ? ` on ${invite.date}` : ""}.`);
  return parts.join("\n");
}

/** The calendar event's description: everything on the invitation that isn't a structured field. */
export function buildEventDescription(invite: InviteExtraction): string | null {
  const parts: string[] = [];
  if (invite.hostNames.length > 0) parts.push(`Hosted by ${invite.hostNames.join(", ")}`);
  if (invite.dressCode) parts.push(`Dress code: ${invite.dressCode}`);
  if (invite.rsvpBy) parts.push(`RSVP by ${invite.rsvpBy}${invite.rsvpContact ? ` to ${invite.rsvpContact}` : ""}`);
  if (invite.registryInfo) parts.push(`Gifts: ${invite.registryInfo}`);
  if (invite.registryUrl && !invite.registryInfo?.includes(invite.registryUrl)) parts.push(`Registry: ${invite.registryUrl}`);
  if (invite.notes) parts.push(invite.notes);
  return parts.length > 0 ? parts.join("\n") : null;
}
