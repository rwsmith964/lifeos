// Ordering and labels for to-do items. Pure so the rules are testable.
import type { TodoRow } from "../db/database.types";

type SortableTodo = Pick<TodoRow, "due_date" | "created_at" | "completed_at">;

/** Open items: soonest due date first (undated last), then oldest first. */
export function sortOpenTodos<T extends SortableTodo>(todos: T[]): T[] {
  return [...todos].sort((a, b) => {
    if (a.due_date && b.due_date && a.due_date !== b.due_date) return a.due_date < b.due_date ? -1 : 1;
    if (a.due_date && !b.due_date) return -1;
    if (!a.due_date && b.due_date) return 1;
    return a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0;
  });
}

/** Finished items: most recently completed first. */
export function sortDoneTodos<T extends SortableTodo>(todos: T[]): T[] {
  return [...todos].sort((a, b) => ((b.completed_at ?? "") < (a.completed_at ?? "") ? -1 : 1));
}

export function isOverdue(todo: Pick<TodoRow, "due_date" | "completed_at">, todayKey: string): boolean {
  return !todo.completed_at && !!todo.due_date && todo.due_date < todayKey;
}
