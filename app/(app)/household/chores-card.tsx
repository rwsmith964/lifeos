"use client";

import { useState } from "react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { useAsyncToastAction } from "@/lib/hooks/use-async-toast-action";
import { ConfirmDeleteButton } from "@/components/ui/confirm-delete-button";
import { addChoreAction, completeChoreAction, removeChoreAction, reopenChoreAction } from "./actions";
import type { ChoreRow, PersonRow } from "@/lib/db/database.types";

function ChoreItem({ chore, people }: { chore: ChoreRow; people: PersonRow[] }) {
  const complete = useAsyncToastAction(() => completeChoreAction(chore.id), { successMessage: "Chore marked done." });
  const reopen = useAsyncToastAction(() => reopenChoreAction(chore.id), { successMessage: "Chore reopened." });
  const assignee = people.find((p) => p.id === chore.assigned_person_id);
  const completedBy = people.find((p) => p.id === chore.completed_by_person_id);

  return (
    <div className="flex items-center justify-between gap-2 rounded-md border p-2">
      <div className="text-sm">
        <div className="flex items-center gap-2">
          <span className={chore.status === "done" ? "text-muted-foreground line-through" : "font-medium"}>
            {chore.title}
          </span>
          <Badge variant={chore.status === "done" ? "secondary" : "default"}>
            {chore.status === "done" ? "Done" : "Open"}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          {assignee ? `Assigned to ${assignee.full_name}` : "Unassigned"}
          {chore.due_date && ` · due ${format(new Date(`${chore.due_date}T00:00:00`), "MMM d")}`}
          {chore.status === "done" && completedBy && ` · completed by ${completedBy.full_name}`}
        </p>
        {chore.description && <p className="text-xs text-muted-foreground">{chore.description}</p>}
      </div>
      <div className="flex items-center gap-1">
        {chore.status === "open" ? (
          <Button size="sm" disabled={complete.pending} onClick={complete.run}>
            Mark done
          </Button>
        ) : (
          <Button size="sm" variant="outline" disabled={reopen.pending} onClick={reopen.run}>
            Reopen
          </Button>
        )}
        <ConfirmDeleteButton
          action={async () => {
            await removeChoreAction(chore.id);
          }}
          label="Remove"
          size="sm"
        />
      </div>
    </div>
  );
}

export function ChoresCard({ chores, people }: { chores: ChoreRow[]; people: PersonRow[] }) {
  const { showToast } = useToast();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assignedPersonId, setAssignedPersonId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [pending, setPending] = useState(false);

  const openChores = chores.filter((c) => c.status === "open");
  const doneChores = chores.filter((c) => c.status === "done");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setPending(true);
    try {
      await addChoreAction({
        title,
        description,
        assignedPersonId: assignedPersonId || null,
        dueDate,
      });
      setTitle("");
      setDescription("");
      setAssignedPersonId("");
      setDueDate("");
      showToast({ title: "Chore added.", variant: "success" });
    } catch (err) {
      showToast({
        title: "Couldn't add that chore",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {chores.length === 0 ? (
        <p className="text-sm text-muted-foreground">No chores yet.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {openChores.map((chore) => (
            <ChoreItem key={chore.id} chore={chore} people={people} />
          ))}
          {doneChores.length > 0 && (
            <>
              <p className="mt-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Done</p>
              {doneChores.map((chore) => (
                <ChoreItem key={chore.id} chore={chore} people={people} />
              ))}
            </>
          )}
        </div>
      )}

      <form onSubmit={submit} className="flex flex-wrap items-end gap-2 border-t pt-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="chore-title">Chore</Label>
          <Input id="chore-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Take out trash" required />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="chore-assignee">Assign to</Label>
          <select
            id="chore-assignee"
            value={assignedPersonId}
            onChange={(e) => setAssignedPersonId(e.target.value)}
            className="h-9 rounded-md border bg-background px-3 text-sm"
          >
            <option value="">Unassigned</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="chore-due">Due (optional)</Label>
          <Input id="chore-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="chore-desc">Notes (optional)</Label>
          <Input id="chore-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <Button type="submit" disabled={pending || !title.trim()} size="sm">
          Add
        </Button>
      </form>
    </div>
  );
}
