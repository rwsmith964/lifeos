// One write path for "I reached out to this person", shared by the Today
// reach-out tile and the person profile so they can't drift apart (they had:
// the profile's version threw on failure with no feedback, so a failed save
// looked identical to a successful one). Returns what it overwrote so the
// caller can offer a real Undo -- logging a contact is reversible, so it
// should be undoable like every other action in the app.
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { ContactType } from "../db/database.types";
import { contactCadencesRepo, getCadenceForPerson, interactionsRepo, recordContactForCadence } from "../db/repositories/contact";
import { interactionInsertSchema } from "../db/schemas";
import { friendlyMutationError } from "../db/errors";

export interface LogContactResult {
  error: string | null;
  interactionId?: string;
  /** The cadence's last_contact_* before this log, so Undo can put it back. null = no cadence row, or none recorded. */
  previousLastContactDate?: string | null;
  previousLastContactType?: ContactType | null;
}

const isoDateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export async function logContact(
  client: SupabaseClient,
  params: {
    householdId: string;
    personId: string;
    type: ContactType;
    /** YYYY-MM-DD in the household's own timezone; null/omitted = today. */
    occurredOn?: string | null;
    todayLocal: string;
  }
): Promise<LogContactResult> {
  const occurredOn = params.occurredOn || params.todayLocal;
  if (!isoDateOnly.safeParse(occurredOn).success) return { error: "That date isn't valid." };
  if (occurredOn > params.todayLocal) return { error: "You can't log a contact in the future." };

  const { data: person, error: personError } = await client
    .from("people")
    .select("id, household_id")
    .eq("id", params.personId)
    .maybeSingle();
  if (personError || !person || person.household_id !== params.householdId) {
    return { error: "Couldn't find that person." };
  }

  const parsed = interactionInsertSchema.safeParse({
    person_id: params.personId,
    interaction_type: params.type,
    occurred_on: occurredOn,
  });
  if (!parsed.success) return { error: "Couldn't log that contact — check the details and try again." };

  try {
    const cadence = await getCadenceForPerson(client, params.personId);
    const interaction = await interactionsRepo.create(client, parsed.data);
    await recordContactForCadence(client, params.personId, occurredOn, params.type);
    return {
      error: null,
      interactionId: interaction.id,
      previousLastContactDate: cadence?.last_contact_date ?? null,
      previousLastContactType: cadence?.last_contact_type ?? null,
    };
  } catch (error) {
    return { error: friendlyMutationError(error, { fallback: "Couldn't log that contact — please try again." }) };
  }
}

/** Reverses logContact: removes the interaction and puts the cadence's last-contact fields back. */
export async function undoLogContact(
  client: SupabaseClient,
  params: {
    householdId: string;
    personId: string;
    interactionId: string;
    previousLastContactDate: string | null;
    previousLastContactType: ContactType | null;
  }
): Promise<{ error: string | null }> {
  try {
    const interaction = await interactionsRepo.getById(client, params.interactionId);
    if (!interaction || interaction.person_id !== params.personId) return { error: "That contact was already removed." };
    await interactionsRepo.remove(client, params.interactionId);

    const cadence = await getCadenceForPerson(client, params.personId);
    if (cadence) {
      await contactCadencesRepo.update(client, cadence.id, {
        last_contact_date: params.previousLastContactDate,
        last_contact_type: params.previousLastContactType,
      });
    }
    return { error: null };
  } catch (error) {
    return { error: friendlyMutationError(error, { fallback: "Couldn't undo that — please try again." }) };
  }
}
