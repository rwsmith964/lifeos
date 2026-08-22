// Email channel (Section 10.2), via Resend. "Stub behind interface if no
// key" (Section 12.9) — without RESEND_API_KEY, this logs to console
// instead of sending, so `pnpm dev` works with zero third-party keys.
import { Resend } from "resend";
import type { SupabaseClient } from "@supabase/supabase-js";
import { peopleRepo } from "../../db/repositories/people";
import type { ChannelAdapter, ChannelDeliveryResult, NotificationPayload } from "../types";

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? "lifeos@example.com";

let cachedClient: Resend | null | undefined;

function getResendClient(): Resend | null {
  if (cachedClient !== undefined) return cachedClient;
  const apiKey = process.env.RESEND_API_KEY;
  cachedClient = apiKey ? new Resend(apiKey) : null;
  return cachedClient;
}

async function send(client: SupabaseClient, payload: NotificationPayload): Promise<ChannelDeliveryResult> {
  const person = await peopleRepo.getById(client, payload.personId);
  if (!person?.email) {
    return { delivered: false, detail: "recipient has no email on file" };
  }

  const resend = getResendClient();
  if (!resend) {
    console.log(`[email:stub] to=${person.email} subject="${payload.title}" body="${payload.body}"`);
    return { delivered: false, detail: "RESEND_API_KEY not configured — logged to console instead" };
  }

  const result = await resend.emails.send({
    from: FROM_EMAIL,
    to: person.email,
    subject: payload.title,
    text: payload.body,
  });

  if (result.error) {
    return { delivered: false, detail: result.error.message };
  }
  return { delivered: true };
}

export const emailChannel: ChannelAdapter = { channel: "email", send };
