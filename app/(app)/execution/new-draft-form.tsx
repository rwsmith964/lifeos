"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { createExecutionDraftAction } from "./actions";
import { CATEGORY_LABELS } from "@/lib/execution/labels";
import { templateForCategory } from "@/lib/execution/generate-draft";
import type { ContactExecutionSettingsRow, ExecutionCategory, PersonRow } from "@/lib/db/database.types";

export function NewDraftForm({
  people,
  contactSettings,
  enabledCategories,
}: {
  people: PersonRow[];
  contactSettings: ContactExecutionSettingsRow[];
  enabledCategories: ExecutionCategory[];
}) {
  const { showToast } = useToast();
  const [category, setCategory] = useState<ExecutionCategory | "">(enabledCategories[0] ?? "");
  const [contactPersonId, setContactPersonId] = useState<string>("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [pending, setPending] = useState(false);

  const excludedIds = useMemo(
    () =>
      new Set(
        people
          .filter((p) => p.relationship_type === "colleague" || contactSettings.find((s) => s.person_id === p.id)?.is_business_contact)
          .map((p) => p.id)
      ),
    [people, contactSettings]
  );

  const selectablePeople = people.filter((p) => !excludedIds.has(p.id));
  const disabled = enabledCategories.length === 0;

  function applyTemplate() {
    if (!category) return;
    const contact = selectablePeople.find((p) => p.id === contactPersonId);
    setBody(templateForCategory(category, contact?.full_name ?? null));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!category) return;
    setPending(true);
    try {
      const contact = selectablePeople.find((p) => p.id === contactPersonId);
      await createExecutionDraftAction({
        category,
        contactPersonId: contactPersonId || null,
        contactName: contact?.full_name ?? null,
        draftSubject: subject,
        draftBody: body,
        useTemplate: false,
      });
      setSubject("");
      setBody("");
      showToast({ title: "Draft saved for review.", variant: "success" });
    } catch (err) {
      showToast({
        title: "Couldn't save that draft.",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="execution-category">Category</Label>
          <select
            id="execution-category"
            className="border-input h-9 w-full rounded-md border bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
            value={category}
            disabled={disabled}
            onChange={(e) => setCategory(e.target.value as ExecutionCategory)}
          >
            {enabledCategories.length === 0 && <option value="">No categories turned on</option>}
            {enabledCategories.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="execution-contact">Contact (optional)</Label>
          <select
            id="execution-contact"
            className="border-input h-9 w-full rounded-md border bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
            value={contactPersonId}
            disabled={disabled}
            onChange={(e) => setContactPersonId(e.target.value)}
          >
            <option value="">No specific contact</option>
            {selectablePeople.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="execution-subject">Subject (optional)</Label>
        <Input
          id="execution-subject"
          value={subject}
          disabled={disabled}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="e.g. Re: Saturday dinner"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="execution-body">Draft text</Label>
          <Button type="button" size="sm" variant="ghost" disabled={disabled || !category} onClick={applyTemplate}>
            Use a starter template
          </Button>
        </div>
        <Textarea
          id="execution-body"
          value={body}
          disabled={disabled}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write the draft, or use a starter template above."
          rows={4}
        />
      </div>

      <div>
        <Button type="submit" disabled={disabled || pending || !category || !body.trim()}>
          {pending ? "Saving…" : "Save for review"}
        </Button>
      </div>
    </form>
  );
}
