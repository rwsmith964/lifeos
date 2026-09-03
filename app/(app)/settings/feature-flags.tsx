"use client";

// Settings > Modules card (D-138). Lets a household owner/adult flip any of
// the Build Brief's module flags on/off without an agent running SQL by
// hand -- see lib/flags.ts for the registry and QUEUE-039 for the gap this
// closes.

import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useAsyncToastAction } from "@/lib/hooks/use-async-toast-action";
import { setFeatureFlagAction } from "./feature-flags-actions";
import { FEATURE_FLAGS, type FeatureFlagKey } from "@/lib/flags";

interface FeatureFlagsProps {
  states: Record<FeatureFlagKey, boolean>;
  canManage: boolean;
}

/** Human-readable name for each flag, split from its longer description. Kept
 * here rather than in lib/flags.ts's registry so that file stays a plain
 * key -> one-line-description map without a UI-label concern mixed in. */
const FLAG_TITLES: Record<FeatureFlagKey, string> = {
  relationship_gift_engine_v2: "Gift pipeline v2",
  leisure_planner_v2: "Leisure planner v2",
  universal_intake_v2: "Universal intake",
  scheduling_v2: "Scheduling v2",
  ambient_display: "Ambient wall display",
  execution_draft_only: "Assistant execution (draft-only)",
  household_layer: "Household layer (meals, groceries, chores)",
  brief_registration_v2: "Brief contributor registration",
  packing_checklist_v2: "Packing checklist wizard",
};

export function FeatureFlags({ states, canManage }: FeatureFlagsProps) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <div>
          <Label>Modules</Label>
          <p className="text-xs text-muted-foreground">
            Turn on features that are still rolling out. Off by default until an owner or adult
            enables them.
          </p>
        </div>
        <div className="flex flex-col divide-y divide-border">
          {(Object.keys(FEATURE_FLAGS) as FeatureFlagKey[]).map((key) => (
            <FlagRow key={key} flagKey={key} enabled={states[key]} canManage={canManage} />
          ))}
        </div>
        {!canManage && (
          <p className="text-xs text-muted-foreground">
            Only household owners and adults can turn modules on or off.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function FlagRow({
  flagKey,
  enabled,
  canManage,
}: {
  flagKey: FeatureFlagKey;
  enabled: boolean;
  canManage: boolean;
}) {
  const { pending, run } = useAsyncToastAction(() => setFeatureFlagAction(flagKey, !enabled), {
    successMessage: !enabled ? `${FLAG_TITLES[flagKey]} turned on` : `${FLAG_TITLES[flagKey]} turned off`,
    onUndo: () => setFeatureFlagAction(flagKey, enabled),
    undoMessage: `${FLAG_TITLES[flagKey]} restored`,
    errorMessage: "Couldn't update that module",
  });

  return (
    <div className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-medium">{FLAG_TITLES[flagKey]}</span>
        <span className="text-xs text-muted-foreground">{FEATURE_FLAGS[flagKey]}</span>
      </div>
      <FlagSwitch
        checked={enabled}
        disabled={!canManage || pending}
        pending={pending}
        onToggle={run}
        label={FLAG_TITLES[flagKey]}
      />
    </div>
  );
}

/**
 * Minimal accessible switch -- no @radix-ui/react-switch in package.json and
 * this is the only place in the app that needs one, so a plain
 * role="switch" button (same pattern the codebase already uses for
 * SuggestionBubble's role="button" click target, D-137) avoids adding a new
 * dependency for a single control.
 */
function FlagSwitch({
  checked,
  disabled,
  pending,
  onToggle,
  label,
}: {
  checked: boolean;
  disabled: boolean;
  pending: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onToggle}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 ${
        checked ? "bg-primary" : "bg-input"
      }`}
    >
      <span
        className={`inline-block size-4 transform rounded-full bg-background shadow-sm transition-transform ${
          checked ? "translate-x-6" : "translate-x-1"
        } ${pending ? "animate-pulse" : ""}`}
      />
    </button>
  );
}
