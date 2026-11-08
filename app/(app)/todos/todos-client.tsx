"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAsyncToastAction } from "@/lib/hooks/use-async-toast-action";
import { cn } from "@/lib/utils";
import { isOverdue, sortDoneTodos, sortOpenTodos } from "@/lib/todos/order";
import {
  assignTodoAction,
  createTodoAction,
  createTodoListAction,
  deleteTodoAction,
  deleteTodoListAction,
  setTodoDoneAction,
} from "./actions";

interface ListView {
  id: string;
  name: string;
  visibility: "shared" | "personal";
  ownerPersonId: string;
}
interface TodoView {
  id: string;
  listId: string;
  title: string;
  dueDate: string | null;
  assignedToPersonId: string | null;
  completedAt: string | null;
  createdAt: string;
}
interface PersonView {
  id: string;
  name: string;
}

const selectClass = "border-input h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs";

function TodoRow({ todo, people, listName, todayKey }: { todo: TodoView; people: PersonView[]; listName: string | null; todayKey: string }) {
  const done = !!todo.completedAt;
  const toggle = useAsyncToastAction(
    async () => {
      const res = await setTodoDoneAction(todo.id, !done);
      if (res.error) throw new Error(res.error);
    },
    { successMessage: done ? "Marked not done." : "Done.", errorMessage: "Couldn't update that" }
  );
  const remove = useAsyncToastAction(
    async () => {
      const res = await deleteTodoAction(todo.id);
      if (res.error) throw new Error(res.error);
    },
    { successMessage: "Deleted.", errorMessage: "Couldn't delete that" }
  );
  const router = useRouter();
  const [assigning, setAssigning] = useState(false);
  const overdue = isOverdue({ due_date: todo.dueDate, completed_at: todo.completedAt }, todayKey);

  async function reassign(personId: string) {
    setAssigning(true);
    const res = await assignTodoAction(todo.id, personId || null);
    setAssigning(false);
    if (!res.error) router.refresh();
  }

  return (
    <li className="flex items-start gap-3 rounded-control border border-line bg-surface px-3 py-2">
      <input
        type="checkbox"
        checked={done}
        disabled={toggle.pending}
        onChange={toggle.run}
        aria-label={done ? `Mark “${todo.title}” not done` : `Mark “${todo.title}” done`}
        className="mt-1 size-4 shrink-0"
      />
      <div className="min-w-0 flex-1">
        <p className={cn("font-sans text-body text-ink", done && "text-meta line-through")}>{todo.title}</p>
        <div className="mt-1 flex flex-wrap items-center gap-2 font-sans text-metadata text-meta">
          {todo.dueDate && (
            <span className={overdue ? "font-bold text-destructive" : undefined}>
              {overdue ? "Overdue · " : "Due "}
              {format(parseISO(todo.dueDate), "EEE, MMM d")}
            </span>
          )}
          {listName && <span>{listName}</span>}
          <label className="flex items-center gap-1">
            <span className="sr-only">Assigned to</span>
            <select
              value={todo.assignedToPersonId ?? ""}
              disabled={assigning || done}
              onChange={(e) => void reassign(e.target.value)}
              className="h-7 rounded-md border border-line bg-transparent px-1.5 text-xs"
            >
              <option value="">Unassigned</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
      <button
        type="button"
        aria-label={`Delete “${todo.title}”`}
        disabled={remove.pending}
        onClick={remove.run}
        className="text-meta hover:text-destructive"
      >
        <Trash2 className="size-4" />
      </button>
    </li>
  );
}

function AddTodoForm({ listId, people, selfPersonId }: { listId: string; people: PersonView[]; selfPersonId: string }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [assignee, setAssignee] = useState("");
  const [due, setDue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit() {
    setError(null);
    if (!title.trim()) return setError("Write what needs doing.");
    setPending(true);
    const res = await createTodoAction({ listId, title, assignedToPersonId: assignee || null, dueDate: due || null });
    setPending(false);
    if (res.error) return setError(res.error);
    setTitle("");
    setDue("");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <Input
          aria-label="New to-do"
          placeholder="Add a to-do…"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void submit();
            }
          }}
          className="min-w-[200px] flex-1"
        />
        <select aria-label="Assign to" value={assignee} onChange={(e) => setAssignee(e.target.value)} className={selectClass}>
          <option value="">Unassigned</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.id === selfPersonId ? `${p.name} (me)` : p.name}
            </option>
          ))}
        </select>
        <Input aria-label="Due date" type="date" value={due} onChange={(e) => setDue(e.target.value)} className="w-40" />
        <Button onClick={() => void submit()} disabled={pending}>
          {pending ? "Adding…" : "Add"}
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

function NewListForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [visibility, setVisibility] = useState<"shared" | "personal">("shared");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit() {
    setError(null);
    setPending(true);
    const res = await createTodoListAction({ name, visibility });
    setPending(false);
    if (res.error) return setError(res.error);
    setName("");
    setOpen(false);
    router.push(`/todos?list=${res.id}`);
    router.refresh();
  }

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} className="self-start">
        + New list
      </Button>
    );
  }
  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="list-name">List name</Label>
          <Input id="list-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Groceries, House projects, My stuff" />
        </div>
        <fieldset className="flex flex-col gap-1">
          <legend className="font-sans text-metadata font-bold text-ink-2">Who can see it?</legend>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="visibility" checked={visibility === "shared"} onChange={() => setVisibility("shared")} />
            Everyone in the household (shared)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="visibility" checked={visibility === "personal"} onChange={() => setVisibility("personal")} />
            Just me (personal)
          </label>
        </fieldset>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex gap-2">
          <Button onClick={() => void submit()} disabled={pending}>
            {pending ? "Creating…" : "Create list"}
          </Button>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function DeleteListButton({ listId, name }: { listId: string; name: string }) {
  const router = useRouter();
  const remove = useAsyncToastAction(
    async () => {
      if (!window.confirm(`Delete “${name}” and everything on it?`)) return;
      const res = await deleteTodoListAction(listId);
      if (res.error) throw new Error(res.error);
      router.push("/todos");
    },
    { successMessage: "List deleted.", errorMessage: "Couldn't delete the list" }
  );
  return (
    <Button variant="ghost" size="sm" disabled={remove.pending} onClick={remove.run}>
      Delete list
    </Button>
  );
}

export function TodosClient({
  selectedId,
  selfPersonId,
  todayKey,
  lists,
  todos,
  people,
}: {
  selectedId: string;
  selfPersonId: string;
  todayKey: string;
  lists: ListView[];
  todos: TodoView[];
  people: PersonView[];
}) {
  const listNameById = new Map(lists.map((l) => [l.id, l.name]));
  const isMine = selectedId === "mine";
  const list = lists.find((l) => l.id === selectedId) ?? null;

  const scoped = isMine ? todos.filter((t) => t.assignedToPersonId === selfPersonId) : todos.filter((t) => t.listId === selectedId);
  const open = sortOpenTodos(scoped.filter((t) => !t.completedAt).map((t) => ({ ...t, due_date: t.dueDate, created_at: t.createdAt, completed_at: t.completedAt })));
  const finished = sortDoneTodos(scoped.filter((t) => !!t.completedAt).map((t) => ({ ...t, due_date: t.dueDate, created_at: t.createdAt, completed_at: t.completedAt })));

  return (
    <div className="flex flex-col gap-4">
      {lists.length === 0 && !isMine ? (
        <Card>
          <CardContent className="flex flex-col gap-2">
            <p className="font-sans text-body text-ink">Start with a list.</p>
            <p className="font-sans text-metadata text-meta">
              Make a shared list (groceries, house projects) the whole household can add to, or a personal one just for you.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {list && <AddTodoForm listId={list.id} people={people} selfPersonId={selfPersonId} />}
          {isMine && <p className="font-sans text-metadata text-meta">Everything on your lists that&apos;s assigned to you.</p>}

          {open.length === 0 && finished.length === 0 ? (
            <p className="font-sans text-body text-ink-2">{isMine ? "Nothing is assigned to you." : "Nothing here yet."}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {open.map((t) => (
                <TodoRow key={t.id} todo={t} people={people} listName={isMine ? (listNameById.get(t.listId) ?? null) : null} todayKey={todayKey} />
              ))}
            </ul>
          )}

          {finished.length > 0 && (
            <details className="rounded-control border border-line bg-surface-2 px-3 py-2">
              <summary className="cursor-pointer font-sans text-metadata font-bold text-ink-2">Done ({finished.length})</summary>
              <ul className="mt-2 flex flex-col gap-2">
                {finished.map((t) => (
                  <TodoRow key={t.id} todo={t} people={people} listName={isMine ? (listNameById.get(t.listId) ?? null) : null} todayKey={todayKey} />
                ))}
              </ul>
            </details>
          )}
          {list && (
            <div>
              <DeleteListButton listId={list.id} name={list.name} />
            </div>
          )}
        </>
      )}
      <NewListForm />
    </div>
  );
}
