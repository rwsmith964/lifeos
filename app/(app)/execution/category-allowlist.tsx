"use client";

import { useAsyncToastAction } from "@/lib/hooks/use-async-toast-action";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toggleExecutionCategoryAction } from "./actions";
import { CATEGORY_LABELS, EXECUTION_CATEGORIES } from "@/lib/execution/labels";
import type { ExecutionCategory } from "@/lib/db/database.types";

function CategoryRow({
  category,
  isEnabled,
  canManage,
}: {
  category: ExecutionCategory;
  isEnabled: boolean;
  canManage: boolean;
}) {
  const toggle = useAsyncToastAction(
    () => toggleExecutionCategoryAction(category, !isEnabled),
    {
      successMessage: isEnabled ? `${CATEGORY_LABELS[category]} turned off.` : `${CATEGORY_LABELS[category]} turned on.`,
      onUndo: () => toggleExecutionCategoryAction(category, isEnabled),
      undoMessage: isEnabled ? `${CATEGORY_LABELS[category]} turned back off.` : `${CATEGORY_LABELS[category]} turned back on.`,
      errorMessage: "Couldn't update that category.",
    }
  );

  return (
    <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">{CATEGORY_LABELS[category]}</span>
        <Badge variant={isEnabled ? "default" : "secondary"}>{isEnabled ? "On" : "Off"}</Badge>
      </div>
      <Button size="sm" variant={isEnabled ? "outline" : "default"} disabled={!canManage || toggle.pending} onClick={toggle.run}>
        {isEnabled ? "Turn off" : "Turn on"}
      </Button>
    </div>
  );
}

export function CategoryAllowlist({
  categoryEnabled,
  canManage,
}: {
  categoryEnabled: Record<ExecutionCategory, boolean>;
  canManage: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      {EXECUTION_CATEGORIES.map((category) => (
        <CategoryRow key={category} category={category} isEnabled={categoryEnabled[category]} canManage={canManage} />
      ))}
      {!canManage && (
        <p className="text-xs text-muted-foreground">Only a household owner or adult can change these.</p>
      )}
    </div>
  );
}
