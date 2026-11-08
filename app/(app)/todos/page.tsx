import Link from "next/link";
import { format } from "date-fns";
import { requireHouseholdContext } from "@/lib/auth/session";
import { getZonedNow } from "@/lib/timezones";
import { listPeopleForHousehold } from "@/lib/db/repositories/people";
import { listTodoListsForHousehold, listTodosForHousehold } from "@/lib/db/repositories/todos";
import { cn } from "@/lib/utils";
import { TodosClient } from "./todos-client";

export const metadata = {
  title: "To-dos — LifeOS",
};

export default async function TodosPage({ searchParams }: { searchParams: Promise<{ list?: string }> }) {
  const { list: listParam } = await searchParams;
  const { supabase, household, selfPerson, timezone } = await requireHouseholdContext();

  // A missing table (migration not applied yet) shows an empty page, not a crash.
  const [lists, todos, people] = await Promise.all([
    listTodoListsForHousehold(supabase, household.id).catch(() => []),
    listTodosForHousehold(supabase, household.id).catch(() => []),
    listPeopleForHousehold(supabase, household.id),
  ]);
  const activePeople = people.filter((p) => !p.is_archived);
  const todayKey = format(getZonedNow(timezone), "yyyy-MM-dd");

  const assignedToMeCount = todos.filter((t) => !t.completed_at && t.assigned_to_person_id === selfPerson.id).length;
  const selectedId =
    listParam === "mine" ? "mine" : lists.some((l) => l.id === listParam) ? (listParam as string) : (lists[0]?.id ?? "mine");

  const tabs = [
    ...lists.map((l) => ({
      id: l.id,
      label: l.name,
      note: l.visibility === "personal" ? "Just me" : "Shared",
      count: todos.filter((t) => t.list_id === l.id && !t.completed_at).length,
    })),
    { id: "mine", label: "Assigned to me", note: null, count: assignedToMeCount },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-display text-xl font-semibold">To-dos</h1>
        <p className="font-sans text-body text-ink-2">
          Shared lists everyone in the household sees, personal lists only you see, and tasks you can hand to someone.
        </p>
      </div>

      <nav aria-label="To-do lists" className="flex flex-wrap gap-1.5">
        {tabs.map((tab) => (
          <Link
            key={tab.id}
            href={`/todos?list=${tab.id}`}
            aria-current={tab.id === selectedId ? "page" : undefined}
            className={cn(
              "rounded-chip border px-3 py-1.5 font-sans text-[12.5px] font-bold motion-safe-transition",
              tab.id === selectedId ? "border-action bg-surface text-ink" : "border-line text-meta hover:text-ink-2"
            )}
          >
            {tab.label}
            {tab.note && <span className="ml-1 font-medium text-meta">· {tab.note}</span>}
            {tab.count > 0 && <span className="ml-1.5 rounded-full bg-surface-2 px-1.5 text-[11px]">{tab.count}</span>}
          </Link>
        ))}
      </nav>

      <TodosClient
        selectedId={selectedId}
        selfPersonId={selfPerson.id}
        todayKey={todayKey}
        lists={lists.map((l) => ({ id: l.id, name: l.name, visibility: l.visibility, ownerPersonId: l.owner_person_id }))}
        todos={todos.map((t) => ({
          id: t.id,
          listId: t.list_id,
          title: t.title,
          dueDate: t.due_date,
          assignedToPersonId: t.assigned_to_person_id,
          completedAt: t.completed_at,
          createdAt: t.created_at,
        }))}
        people={activePeople.map((p) => ({ id: p.id, name: p.nickname || p.full_name }))}
      />
    </div>
  );
}
