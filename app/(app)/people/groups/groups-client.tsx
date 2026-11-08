"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAsyncToastAction } from "@/lib/hooks/use-async-toast-action";
import { createGroupAction, deleteGroupAction } from "./actions";

interface GroupView {
  id: string;
  name: string;
  members: string[];
}

function GroupRow({ group }: { group: GroupView }) {
  const remove = useAsyncToastAction(
    async () => {
      const res = await deleteGroupAction(group.id);
      if (res.error) throw new Error(res.error);
    },
    { successMessage: "Group deleted.", errorMessage: "Couldn't delete the group" }
  );
  return (
    <li className="flex items-start justify-between gap-2 rounded-control border border-line bg-surface px-3 py-2">
      <div>
        <p className="font-sans text-body font-bold text-ink">{group.name}</p>
        <p className="font-sans text-metadata text-meta">{group.members.join(", ") || "No members"}</p>
      </div>
      <Button size="sm" variant="ghost" disabled={remove.pending} onClick={remove.run}>
        Delete
      </Button>
    </li>
  );
}

export function GroupsClient({ people, groups }: { people: Array<{ id: string; name: string }>; groups: GroupView[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function create() {
    setError(null);
    setPending(true);
    const res = await createGroupAction({ name, memberPersonIds: [...selected] });
    setPending(false);
    if (res.error) return setError(res.error);
    setName("");
    setSelected(new Set());
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      {groups.length > 0 && (
        <ul className="flex flex-col gap-2">
          {groups.map((g) => (
            <GroupRow key={g.id} group={g} />
          ))}
        </ul>
      )}
      <Card>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="group-name">New group</Label>
            <Input id="group-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Thanksgiving crowd" />
          </div>
          <fieldset className="flex flex-col gap-1">
            <legend className="font-sans text-metadata font-bold text-ink-2">Who&apos;s in it</legend>
            {people.length === 0 && <p className="text-sm text-muted-foreground">Add people first.</p>}
            {people.map((p) => (
              <label key={p.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={selected.has(p.id)}
                  onChange={(e) =>
                    setSelected((prev) => {
                      const next = new Set(prev);
                      if (e.target.checked) next.add(p.id);
                      else next.delete(p.id);
                      return next;
                    })
                  }
                />
                {p.name}
              </label>
            ))}
          </fieldset>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button onClick={() => void create()} disabled={pending} className="self-start">
            {pending ? "Saving…" : "Save group"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
