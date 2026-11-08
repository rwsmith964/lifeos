"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireHouseholdContext } from "@/lib/auth/session";
import { todoListsRepo, todosRepo } from "@/lib/db/repositories/todos";
import { listPeopleForHousehold } from "@/lib/db/repositories/people";
import { friendlyMutationError } from "@/lib/db/errors";

export interface TodoActionResult {
  error: string | null;
  id?: string;
}

const uuid = z.string().uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const newListSchema = z.object({
  name: z.string().trim().min(1, "Give the list a name.").max(80),
  visibility: z.enum(["shared", "personal"]),
});

const newTodoSchema = z.object({
  listId: uuid,
  title: z.string().trim().min(1, "Write what needs doing.").max(200),
  assignedToPersonId: uuid.nullable(),
  dueDate: isoDate.nullable(),
});

function done(): TodoActionResult {
  revalidatePath("/todos");
  return { error: null };
}

export async function createTodoListAction(input: z.infer<typeof newListSchema>): Promise<TodoActionResult> {
  const parsed = newListSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the list details." };
  const { supabase, household, selfPerson } = await requireHouseholdContext();
  try {
    const list = await todoListsRepo.create(supabase, {
      household_id: household.id,
      name: parsed.data.name,
      visibility: parsed.data.visibility,
      owner_person_id: selfPerson.id,
    });
    revalidatePath("/todos");
    return { error: null, id: list.id };
  } catch (error) {
    return { error: friendlyMutationError(error, { fallback: "Couldn't create the list — please try again." }) };
  }
}

export async function deleteTodoListAction(listId: string): Promise<TodoActionResult> {
  if (!uuid.safeParse(listId).success) return { error: "That list wasn't found." };
  const { supabase } = await requireHouseholdContext();
  try {
    await todoListsRepo.remove(supabase, listId);
    return done();
  } catch (error) {
    return { error: friendlyMutationError(error, { fallback: "Couldn't delete the list — please try again." }) };
  }
}

export async function createTodoAction(input: z.infer<typeof newTodoSchema>): Promise<TodoActionResult> {
  const parsed = newTodoSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the details." };
  const { supabase, household, selfPerson } = await requireHouseholdContext();
  try {
    const list = await todoListsRepo.getById(supabase, parsed.data.listId);
    if (!list || list.household_id !== household.id) return { error: "That list wasn't found." };

    // Only people in this household can be assigned.
    if (parsed.data.assignedToPersonId) {
      const people = await listPeopleForHousehold(supabase, household.id);
      if (!people.some((p) => p.id === parsed.data.assignedToPersonId)) return { error: "That person wasn't found." };
    }

    const todo = await todosRepo.create(supabase, {
      household_id: household.id,
      list_id: list.id,
      title: parsed.data.title,
      due_date: parsed.data.dueDate,
      assigned_to_person_id: parsed.data.assignedToPersonId,
      created_by_person_id: selfPerson.id,
    });
    revalidatePath("/todos");
    return { error: null, id: todo.id };
  } catch (error) {
    return { error: friendlyMutationError(error, { fallback: "Couldn't add that — please try again." }) };
  }
}

export async function setTodoDoneAction(todoId: string, isDone: boolean): Promise<TodoActionResult> {
  if (!uuid.safeParse(todoId).success) return { error: "That item wasn't found." };
  const { supabase, selfPerson } = await requireHouseholdContext();
  try {
    await todosRepo.update(supabase, todoId, {
      completed_at: isDone ? new Date().toISOString() : null,
      completed_by_person_id: isDone ? selfPerson.id : null,
    });
    return done();
  } catch (error) {
    return { error: friendlyMutationError(error, { fallback: "Couldn't update that — please try again." }) };
  }
}

export async function assignTodoAction(todoId: string, personId: string | null): Promise<TodoActionResult> {
  if (!uuid.safeParse(todoId).success || (personId !== null && !uuid.safeParse(personId).success)) {
    return { error: "That item wasn't found." };
  }
  const { supabase, household } = await requireHouseholdContext();
  try {
    if (personId) {
      const people = await listPeopleForHousehold(supabase, household.id);
      if (!people.some((p) => p.id === personId)) return { error: "That person wasn't found." };
    }
    await todosRepo.update(supabase, todoId, { assigned_to_person_id: personId });
    return done();
  } catch (error) {
    return { error: friendlyMutationError(error, { fallback: "Couldn't assign that — please try again." }) };
  }
}

export async function deleteTodoAction(todoId: string): Promise<TodoActionResult> {
  if (!uuid.safeParse(todoId).success) return { error: "That item wasn't found." };
  const { supabase } = await requireHouseholdContext();
  try {
    await todosRepo.remove(supabase, todoId);
    return done();
  } catch (error) {
    return { error: friendlyMutationError(error, { fallback: "Couldn't delete that — please try again." }) };
  }
}
