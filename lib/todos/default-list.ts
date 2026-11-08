// Where a to-do goes when nobody picked a list (for example one read from a
// photo): the person's own personal "My to-dos" list, created on first use.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { TodoListRow } from "../db/database.types";
import { listTodoListsForHousehold, todoListsRepo } from "../db/repositories/todos";

export const DEFAULT_TODO_LIST_NAME = "My to-dos";

export async function ensureDefaultTodoList(
  supabase: SupabaseClient,
  householdId: string,
  personId: string
): Promise<TodoListRow> {
  const lists = await listTodoListsForHousehold(supabase, householdId);
  const existing = lists.find(
    (l) => l.visibility === "personal" && l.owner_person_id === personId && l.name === DEFAULT_TODO_LIST_NAME
  );
  if (existing) return existing;
  return todoListsRepo.create(supabase, {
    household_id: householdId,
    name: DEFAULT_TODO_LIST_NAME,
    visibility: "personal",
    owner_person_id: personId,
  });
}
