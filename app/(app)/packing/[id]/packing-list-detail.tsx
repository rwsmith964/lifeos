"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { useAsyncToastAction } from "@/lib/hooks/use-async-toast-action";
import { ConfirmDeleteButton } from "@/components/ui/confirm-delete-button";
import { TRIP_TYPE_LABELS } from "@/lib/ai/prompts/packing-checklist";
import type { PackingListItemRow, PackingListRow, PersonRow } from "@/lib/db/database.types";
import {
  addManualItemAction,
  archivePackingListAction,
  deletePackingListAction,
  generateChecklistAction,
  reactivatePackingListAction,
  removeItemAction,
  toggleItemCheckedAction,
} from "../actions";

const CATEGORY_LABELS: Record<string, string> = {
  clothing: "Clothing",
  toiletries: "Toiletries",
  documents: "Documents",
  electronics: "Electronics",
  kids: "Kids",
  activity_gear: "Activity gear",
  health: "Health",
  other: "Other",
};

function GenerateChecklistButton({ packingListId }: { packingListId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function handleGenerate() {
    setError(null);
    startTransition(async () => {
      const result = await generateChecklistAction(packingListId);
      if (result.status === "generated") {
        router.refresh();
      } else {
        setError(result.reason);
      }
    });
  }

  return (
    <Card>
      <CardContent className="flex flex-col items-start gap-3 pt-6">
        <p className="text-sm text-muted-foreground">
          No items yet. Generate a checklist tailored to this trip&apos;s type, dates, travelers, and planned activities.
        </p>
        <Button type="button" onClick={handleGenerate} disabled={pending}>
          {pending ? "Generating…" : "Generate checklist"}
        </Button>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}

function ItemRow({ item }: { item: PackingListItemRow }) {
  const toggle = useAsyncToastAction(() => toggleItemCheckedAction(item.id, !item.checked), {
    successMessage: item.checked ? "Item unchecked." : "Item checked off.",
  });

  return (
    <div className="flex items-center justify-between gap-2 rounded-md border p-2">
      <label className="flex flex-1 items-center gap-2 text-sm">
        <input type="checkbox" checked={item.checked} disabled={toggle.pending} onChange={toggle.run} />
        <span className={item.checked ? "text-muted-foreground line-through" : ""}>{item.label}</span>
        {item.category && (
          <span className="text-xs text-muted-foreground">{CATEGORY_LABELS[item.category] ?? item.category}</span>
        )}
      </label>
      <ConfirmDeleteButton
        action={async () => {
          await removeItemAction(item.id);
        }}
        label="Remove"
        variant="icon"
        ariaLabel={`Remove ${item.label}`}
      />
    </div>
  );
}

function AddItemForm({ packingListId }: { packingListId: string }) {
  const { showToast } = useToast();
  const [label, setLabel] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim()) return;
    setPending(true);
    try {
      await addManualItemAction(packingListId, label);
      setLabel("");
      showToast({ title: "Item added.", variant: "success" });
    } catch (err) {
      showToast({
        title: "Couldn't add that item",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex items-end gap-2 border-t pt-3">
      <div className="flex flex-1 flex-col gap-1">
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Add an item…"
          aria-label="Add an item"
        />
      </div>
      <Button type="submit" size="sm" disabled={pending || !label.trim()}>
        Add
      </Button>
    </form>
  );
}

export function PackingListDetail({
  packingList,
  items,
  people,
}: {
  packingList: PackingListRow;
  items: PackingListItemRow[];
  people: PersonRow[];
}) {
  const router = useRouter();
  const archive = useAsyncToastAction(() => archivePackingListAction(packingList.id), {
    successMessage: "Packing list archived.",
  });
  const reactivate = useAsyncToastAction(() => reactivatePackingListAction(packingList.id), {
    successMessage: "Packing list reactivated.",
  });

  const peopleById = new Map(people.map((p) => [p.id, p]));
  const travelerNames = packingList.traveler_person_ids
    .map((id) => peopleById.get(id)?.full_name)
    .filter((name): name is string => !!name);

  const checkedCount = items.filter((i) => i.checked).length;

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">{packingList.title}</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            {TRIP_TYPE_LABELS[packingList.trip_type]}
            {packingList.destination ? ` · ${packingList.destination}` : ""}
            {packingList.start_date
              ? ` · ${format(new Date(`${packingList.start_date}T00:00:00`), "MMM d")}${
                  packingList.end_date
                    ? `–${format(new Date(`${packingList.end_date}T00:00:00`), "MMM d")}`
                    : ""
                }`
              : ""}
            {travelerNames.length > 0 ? ` · ${travelerNames.join(", ")}` : ""}
          </p>
          {packingList.planned_activities && (
            <p className="mt-1 text-xs text-muted-foreground">Activities: {packingList.planned_activities}</p>
          )}
        </div>
        {packingList.status === "archived" && <Badge variant="secondary">Archived</Badge>}
      </div>

      {items.length === 0 ? (
        <GenerateChecklistButton packingListId={packingList.id} />
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            {checkedCount} of {items.length} packed
          </p>
          <div className="flex flex-col gap-2">
            {items.map((item) => (
              <ItemRow key={item.id} item={item} />
            ))}
          </div>
        </>
      )}

      <AddItemForm packingListId={packingList.id} />

      <div className="flex items-center justify-between gap-2 border-t pt-3">
        {packingList.status === "active" ? (
          <Button type="button" size="sm" variant="outline" disabled={archive.pending} onClick={archive.run}>
            Archive
          </Button>
        ) : (
          <Button type="button" size="sm" variant="outline" disabled={reactivate.pending} onClick={reactivate.run}>
            Reactivate
          </Button>
        )}
        <ConfirmDeleteButton
          action={async () => {
            await deletePackingListAction(packingList.id);
            router.push("/packing");
          }}
          label="Delete list"
          dialogTitle="Delete this packing list?"
          dialogDescription="This removes the list and all its items. This can't be undone."
        />
      </div>
    </div>
  );
}
