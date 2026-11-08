"use client";

// The "build out an event" parts of the event form: who's invited (people and
// groups, with a note just for each person), whose house it's at, and an
// optional itinerary. Everything submits as plain form fields so the existing
// form-post plumbing is unchanged.
import { useState } from "react";
import Link from "next/link";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { personDisplayName } from "@/lib/people/display-name";
import { DELIVERY_LABEL, deliveryFor } from "@/lib/events/invite-plan";
import type { ItineraryItem, PersonGroupRow, PersonRow } from "@/lib/db/database.types";

export function EventPeopleFields({
  people,
  groups,
  defaultSelected,
  defaultNotes,
}: {
  people: PersonRow[];
  groups: PersonGroupRow[];
  defaultSelected: string[];
  defaultNotes: Record<string, string>;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(defaultSelected));

  function toggle(id: string, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function addGroup(group: PersonGroupRow) {
    setSelected((prev) => new Set([...prev, ...group.member_person_ids.filter((id) => people.some((p) => p.id === id))]));
  }

  const invitableSelected = people.filter((p) => selected.has(p.id) && ["linked", "email"].includes(deliveryFor(p)));

  if (people.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <Label>Who&apos;s invited</Label>
        <Link href="/people/groups" className="font-sans text-metadata text-meta underline underline-offset-2">
          Manage groups
        </Link>
      </div>
      {groups.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-sans text-metadata text-meta">Add a group:</span>
          {groups.map((g) => (
            <Button key={g.id} type="button" size="sm" variant="outline" onClick={() => addGroup(g)}>
              {g.name}
            </Button>
          ))}
        </div>
      )}
      <div className="flex flex-col gap-2">
        {people.map((person) => {
          const on = selected.has(person.id);
          const delivery = deliveryFor(person);
          return (
            <div key={person.id} className="flex flex-col gap-1 rounded-md border p-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="attendeePersonIds"
                  value={person.id}
                  checked={on}
                  onChange={(e) => toggle(person.id, e.target.checked)}
                />
                <span className="font-medium">{personDisplayName(person)}</span>
                <span className="text-xs text-muted-foreground">· {DELIVERY_LABEL[delivery]}</span>
              </label>
              {on && (
                <Input
                  name={`note__${person.id}`}
                  defaultValue={defaultNotes[person.id] ?? ""}
                  placeholder={`A note just for ${person.nickname || person.full_name} (e.g. bring the pecan pie)`}
                  aria-label={`Note for ${person.nickname || person.full_name}`}
                />
              )}
            </div>
          );
        })}
      </div>
      {invitableSelected.length > 0 && (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="sendInvites" defaultChecked className="mt-1" />
          <span>
            Send invitations to {invitableSelected.map((p) => p.nickname || p.full_name).join(", ")}
            <span className="block text-xs text-muted-foreground">
              They can accept and add it to their own calendar, and get drive-time and prep suggestions.
            </span>
          </span>
        </label>
      )}
    </div>
  );
}

export function HostField({ people, defaultHostId }: { people: PersonRow[]; defaultHostId: string }) {
  function onChange(id: string) {
    const person = people.find((p) => p.id === id);
    const location = document.getElementById("location") as HTMLInputElement | null;
    // Hosted at someone's house: fill in their address unless a place is already typed.
    if (person?.address && location && !location.value.trim()) location.value = person.address;
  }
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="hostPersonId">Hosted at someone&apos;s house (optional)</Label>
      <select
        id="hostPersonId"
        name="hostPersonId"
        defaultValue={defaultHostId}
        onChange={(e) => onChange(e.target.value)}
        className="border-input h-9 rounded-md border bg-transparent px-3 text-sm sm:w-72"
      >
        <option value="">Not at anyone&apos;s house</option>
        {people.map((p) => (
          <option key={p.id} value={p.id}>
            {personDisplayName(p)}
            {p.address ? "" : " (no address saved)"}
          </option>
        ))}
      </select>
    </div>
  );
}

export function ItineraryField({ defaultItems }: { defaultItems: ItineraryItem[] }) {
  const [items, setItems] = useState<ItineraryItem[]>(defaultItems);

  function update(index: number, patch: Partial<ItineraryItem>) {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  return (
    <div className="flex flex-col gap-2">
      <Label>Itinerary (optional)</Label>
      <input type="hidden" name="itinerary" value={JSON.stringify(items.filter((i) => i.title.trim()))} />
      {items.map((item, index) => (
        <div key={index} className="flex flex-wrap items-center gap-2">
          <Input
            type="time"
            aria-label="Time"
            value={item.time}
            onChange={(e) => update(index, { time: e.target.value })}
            className="w-32"
          />
          <Input
            aria-label="What happens"
            placeholder="e.g. Appetizers"
            value={item.title}
            onChange={(e) => update(index, { title: e.target.value })}
            className="min-w-[160px] flex-1"
          />
          <Input
            aria-label="Notes"
            placeholder="Notes (optional)"
            value={item.notes}
            onChange={(e) => update(index, { notes: e.target.value })}
            className="min-w-[140px] flex-1"
          />
          <button
            type="button"
            aria-label="Remove this item"
            onClick={() => setItems((prev) => prev.filter((_, i) => i !== index))}
            className="text-meta hover:text-destructive"
          >
            <X className="size-4" />
          </button>
        </div>
      ))}
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="self-start"
        onClick={() => setItems((prev) => [...prev, { time: "", title: "", notes: "" }])}
      >
        <Plus className="size-4" /> Add a step
      </Button>
    </div>
  );
}
