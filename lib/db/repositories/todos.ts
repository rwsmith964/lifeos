import type { SupabaseClient } from "@supabase/supabase-js";
import { createRepository } from "../repository";
import type { TodoInsert, TodoListInsert, TodoListRow, TodoListUpdate, TodoRow, TodoUpdate } from "../database.types";

export const todoListsRepo = createRepository<TodoListRow, TodoListInsert, TodoListUpdate>("todo_lists");
export const todosRepo = createRepository<TodoRow, TodoInsert, TodoUpdate>("todos");

/** Lists the signed-in person can see (shared ones, plus their own personal ones -- enforced by RLS). */
export async function listTodoListsForHousehold(client: SupabaseClient, householdId: string): Promise<TodoListRow[]> {
  return todoListsRepo.list(client, (q) => q.eq("household_id", householdId).order("created_at", { ascending: true }));
}

export async function listTodosForHousehold(client: SupabaseClient, householdId: string): Promise<TodoRow[]> {
  return todosRepo.list(client, (q) => q.eq("household_id", householdId).order("created_at", { ascending: true }));
}
