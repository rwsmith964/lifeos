"use client";

import { useState } from "react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { useAsyncToastAction } from "@/lib/hooks/use-async-toast-action";
import { ConfirmDeleteButton } from "@/components/ui/confirm-delete-button";
import { generateGroceryListAction, removeGroceryListAction, toggleGroceryItemCheckedAction } from "./actions";
import { GROCERY_AISLES, GROCERY_AISLE_LABELS } from "@/lib/household/labels";
import type { GroceryAisle, GroceryListItemRow, GroceryListRow } from "@/lib/db/database.types";

function GroceryListCard({ list, items }: { list: GroceryListRow; items: GroceryListItemRow[] }) {
  const itemsByAisle = new Map<GroceryAisle, GroceryListItemRow[]>();
  for (const aisle of GROCERY_AISLES) {
    const inAisle = items.filter((i) => i.aisle === aisle);
    if (inAisle.length > 0) itemsByAisle.set(aisle, inAisle);
  }
  const checkedCount = items.filter((i) => i.is_checked).length;

  return (
    <div className="rounded-md border p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{list.title}</p>
          <p className="text-xs text-muted-foreground">
            {format(new Date(list.created_at), "MMM d")} · {checkedCount}/{items.length} checked off
          </p>
        </div>
        <ConfirmDeleteButton
          action={async () => {
            await removeGroceryListAction(list.id);
          }}
          label="Remove"
          size="sm"
        />
      </div>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">No items — every ingredient was already in the pantry.</p>
      ) : (
        <div className="mt-2 flex flex-col gap-3">
          {Array.from(itemsByAisle.entries()).map(([aisle, aisleItems]) => (
            <div key={aisle}>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {GROCERY_AISLE_LABELS[aisle]}
              </p>
              <div className="mt-1 flex flex-col gap-1">
                {aisleItems.map((item) => (
                  <GroceryItemRow key={item.id} item={item} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function GroceryItemRow({ item }: { item: GroceryListItemRow }) {
  const toggle = useAsyncToastAction(() => toggleGroceryItemCheckedAction(item.id, !item.is_checked), {
    successMessage: item.is_checked ? "Unchecked." : "Checked off.",
  });

  return (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={item.is_checked}
        disabled={toggle.pending}
        onChange={toggle.run}
        className="size-4"
      />
      <span className={item.is_checked ? "text-muted-foreground line-through" : ""}>
        {item.name}
        {item.quantity && <span className="text-muted-foreground"> — {item.quantity}</span>}
      </span>
    </label>
  );
}

export function GroceryListsCard({
  lists,
  itemsByListId,
  defaultStartDate,
  defaultEndDate,
}: {
  lists: GroceryListRow[];
  itemsByListId: Record<string, GroceryListItemRow[]>;
  defaultStartDate: string;
  defaultEndDate: string;
}) {
  const { showToast } = useToast();
  const [title, setTitle] = useState("Grocery list");
  const [startDate, setStartDate] = useState(defaultStartDate);
  const [endDate, setEndDate] = useState(defaultEndDate);
  const [pending, setPending] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    try {
      await generateGroceryListAction(title, startDate, endDate);
      showToast({ title: "Grocery list generated from the meal plan.", variant: "success" });
    } catch (err) {
      showToast({
        title: "Couldn't generate that list",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {lists.length === 0 ? (
        <p className="text-sm text-muted-foreground">No grocery lists yet.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {lists.map((list) => (
            <GroceryListCard key={list.id} list={list} items={itemsByListId[list.id] ?? []} />
          ))}
        </div>
      )}

      <form onSubmit={submit} className="flex flex-wrap items-end gap-2 border-t pt-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="gl-title">List name</Label>
          <Input id="gl-title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="gl-start">From</Label>
          <Input id="gl-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="gl-end">To</Label>
          <Input id="gl-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
        <Button type="submit" disabled={pending} size="sm">
          Generate from meal plan
        </Button>
      </form>
    </div>
  );
}
