"use client";

// D-055 household switching. Only ever rendered by SettingsPage when the
// current user has more than one household_members row — see
// requireHouseholdContext()'s `memberships` field. Kept as its own file
// (not folded into household-members.tsx) since it operates on the
// caller's OWN cross-household membership list, not on one household's
// member roster.
import { useState, useTransition } from "react";
import { switchActiveHouseholdAction } from "./household-invite-actions";
import type { HouseholdRole } from "@/lib/db/database.types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";

const roleLabel: Record<HouseholdRole, string> = {
  owner: "Owner",
  adult: "Adult",
  child: "Child",
  viewer: "Viewer",
};

export interface HouseholdSwitcherItem {
  householdId: string;
  householdName: string;
  role: HouseholdRole;
}

function SwitchButton({ householdId }: { householdId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            // On success this redirects and never resolves normally — see
            // switchActiveHouseholdAction. Only the error path returns.
            const result = await switchActiveHouseholdAction(householdId);
            if (result?.error) setError(result.error);
          });
        }}
      >
        {pending ? "Switching…" : "Switch"}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

export function HouseholdSwitcher({
  households,
  activeHouseholdId,
}: {
  households: HouseholdSwitcherItem[];
  activeHouseholdId: string;
}) {
  if (households.length <= 1) return null;

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <Label>Your households</Label>
        <p className="text-xs text-muted-foreground">
          You belong to more than one household. Switch which one shows up across the app.
        </p>
        <ul className="flex flex-col gap-2">
          {households.map((h) => {
            const isActive = h.householdId === activeHouseholdId;
            return (
              <li key={h.householdId} className="flex items-center justify-between gap-2 text-sm">
                <span className="flex items-center gap-2">
                  <span>{h.householdName}</span>
                  <Badge variant="outline">{roleLabel[h.role]}</Badge>
                  {isActive && <Badge>Active</Badge>}
                </span>
                {!isActive && <SwitchButton householdId={h.householdId} />}
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
