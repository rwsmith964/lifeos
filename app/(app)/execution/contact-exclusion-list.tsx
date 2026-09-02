"use client";

import { useAsyncToastAction } from "@/lib/hooks/use-async-toast-action";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { setContactBusinessFlagAction } from "./actions";
import type { ContactExecutionSettingsRow, PersonRow } from "@/lib/db/database.types";

function ContactRow({
  person,
  isBusinessContact,
  canManage,
}: {
  person: PersonRow;
  isBusinessContact: boolean;
  canManage: boolean;
}) {
  const isColleague = person.relationship_type === "colleague";
  const toggle = useAsyncToastAction(
    () => setContactBusinessFlagAction(person.id, !isBusinessContact),
    {
      successMessage: isBusinessContact
        ? `${person.full_name} can receive drafts again.`
        : `${person.full_name} is now excluded from drafts.`,
      onUndo: () => setContactBusinessFlagAction(person.id, isBusinessContact),
      undoMessage: "Change undone.",
      errorMessage: "Couldn't update that contact.",
    }
  );

  const excluded = isColleague || isBusinessContact;

  return (
    <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">{person.full_name}</span>
        {excluded && <Badge variant="destructive">Excluded</Badge>}
        {isColleague && <span className="text-xs text-muted-foreground">Colleague — always excluded</span>}
      </div>
      {!isColleague && (
        <Button size="sm" variant={isBusinessContact ? "outline" : "secondary"} disabled={!canManage || toggle.pending} onClick={toggle.run}>
          {isBusinessContact ? "Allow drafts" : "Exclude"}
        </Button>
      )}
    </div>
  );
}

export function ContactExclusionList({
  people,
  contactSettings,
  canManage,
}: {
  people: PersonRow[];
  contactSettings: ContactExecutionSettingsRow[];
  canManage: boolean;
}) {
  if (people.length === 0) {
    return <p className="text-sm text-muted-foreground">No other people in this household yet.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {people.map((person) => {
        const settings = contactSettings.find((s) => s.person_id === person.id);
        return (
          <ContactRow
            key={person.id}
            person={person}
            isBusinessContact={settings?.is_business_contact ?? false}
            canManage={canManage}
          />
        );
      })}
      {!canManage && (
        <p className="text-xs text-muted-foreground">Only a household owner or adult can change these.</p>
      )}
    </div>
  );
}
