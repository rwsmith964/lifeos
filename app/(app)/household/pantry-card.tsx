"use client";

import { useState } from "react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { ConfirmDeleteButton } from "@/components/ui/confirm-delete-button";
import { addPantryItemAction, removePantryItemAction } from "./actions";
import { GROCERY_AISLES, GROCERY_AISLE_LABELS } from "@/lib/household/labels";
import type { GroceryAisle, PantryItemRow } from "@/lib/db/database.types";

export function PantryCard({ items }: { items: PantryItemRow[] }) {
  const { showToast } = useToast();
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [aisle, setAisle] = useState<GroceryAisle>("pantry");
  const [expiresOn, setExpiresOn] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setPending(true);
    try {
      await addPantryItemAction(name, quantity, aisle, expiresOn);
      setName("");
      setQuantity("");
      setExpiresOn("");
      showToast({ title: "Pantry item added.", variant: "success" });
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
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">
        Anything on hand here is skipped automatically when a grocery list is generated from the meal plan.
      </p>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Pantry is empty.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-2 rounded-md border p-2">
              <div className="text-sm">
                <span className="font-medium">{item.name}</span>
                {item.quantity && <span className="text-muted-foreground"> — {item.quantity}</span>}
                <span className="text-muted-foreground"> · {GROCERY_AISLE_LABELS[item.aisle]}</span>
                {item.expires_on && (
                  <span className="text-muted-foreground"> · expires {format(new Date(item.expires_on), "MMM d")}</span>
                )}
              </div>
              <ConfirmDeleteButton
                action={async () => {
                  await removePantryItemAction(item.id);
                }}
                label="Remove"
                size="sm"
              />
            </div>
          ))}
        </div>
      )}

      <form onSubmit={submit} className="flex flex-wrap items-end gap-2 border-t pt-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="pantry-name">Item</Label>
          <Input id="pantry-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. rice" required />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="pantry-qty">Quantity</Label>
          <Input id="pantry-qty" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="e.g. 2 bags" />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="pantry-aisle">Aisle</Label>
          <select
            id="pantry-aisle"
            value={aisle}
            onChange={(e) => setAisle(e.target.value as GroceryAisle)}
            className="h-9 rounded-md border bg-background px-3 text-sm"
          >
            {GROCERY_AISLES.map((a) => (
              <option key={a} value={a}>
                {GROCERY_AISLE_LABELS[a]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="pantry-expires">Expires (optional)</Label>
          <Input id="pantry-expires" type="date" value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} />
        </div>
        <Button type="submit" disabled={pending || !name.trim()} size="sm">
          Add
        </Button>
      </form>
    </div>
  );
}
