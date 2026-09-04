// D-165 (QUEUE-006, leisure_planner_v2): wires a household's declared
// activity_type_viability_configs into the weekend planner's candidate
// scoring/gating, per the module's own migration comment that flagged this
// as a deliberate v1 gap (see supabase/migrations/20260901000003_module2_
// leisure_planner.sql). Pure, DB-free logic lives here so it can be unit
// tested directly -- generate.ts only wires the inputs/outputs.
//
// Design note (also recorded in DECISIONS.md D-165): the config table only
// stores which inputs matter for an activity type (relevant_inputs text[]),
// not numeric thresholds ("river flow below 500 cfs"). There is nowhere to
// store or evaluate a threshold today, so this cannot filter on whether a
// fetched condition value is favorable -- only on whether the data needed
// to check a declared-relevant condition exists at all for the candidate's
// location. Threshold-based gating would need a schema change and is
// tracked separately (see QUESTIONS.md QUEUE-006 update).

export interface ViabilityInputFlags {
  /** Household declared at least one input for this activity type. */
  configured: boolean;
  wantsRiverFlow: boolean;
  wantsOdfw: boolean;
  wantsTide: boolean;
  wantsSolunar: boolean;
}

/** Matches the shape of LocationRow.external_ids (Record<string, string>) --
 * declared narrowly here so this module has no dependency on database.types. */
export interface LocationExternalIdsLike {
  usgs_gauge?: string | null;
  odfw_zone_url?: string | null;
  noaa_station?: string | null;
}

/**
 * Decides which external condition checks are relevant for one candidate.
 *
 * When the household has saved a non-empty viability config for this
 * activity type, that declaration is authoritative -- only the data
 * sources it names are fetched/computed, even if the location happens to
 * carry other external_ids that would otherwise imply relevance. When no
 * config exists (or the saved one names zero inputs), behavior is
 * unchanged from the original heuristic: infer relevance purely from
 * which external_ids the location has on file.
 */
export function resolveViabilityInputs(
  relevantInputs: readonly string[] | null | undefined,
  externalIds: LocationExternalIdsLike | null | undefined
): ViabilityInputFlags {
  const hasUsgs = Boolean(externalIds?.usgs_gauge);
  const hasOdfw = Boolean(externalIds?.odfw_zone_url);
  const hasTide = Boolean(externalIds?.noaa_station);
  const configured = Boolean(relevantInputs && relevantInputs.length > 0);

  if (!configured) {
    return {
      configured: false,
      wantsRiverFlow: hasUsgs,
      wantsOdfw: hasOdfw,
      wantsTide: hasTide,
      // Original heuristic (isFishingRelevantLocation): any fishing/hunting
      // -relevant location (usgs OR odfw) also gets solunar periods.
      wantsSolunar: hasUsgs || hasOdfw,
    };
  }

  const set = new Set(relevantInputs!.map((s) => s.toLowerCase()));
  return {
    configured: true,
    wantsRiverFlow: set.has("river_flow"),
    wantsOdfw: set.has("odfw"),
    wantsTide: set.has("tide"),
    wantsSolunar: set.has("solunar"),
  };
}

/**
 * True when the household explicitly declared that at least one
 * data-backed condition (river flow, ODFW report, or tide) matters for
 * this activity type, but the candidate's location can't supply any of
 * the declared inputs -- i.e. there is no way to check the exact
 * condition the household said to check. Callers should skip the
 * candidate entirely rather than recommend it unverified.
 *
 * Never fires when no config exists for the type (undecided households see
 * identical behavior to before D-165), and never fires for a config that
 * only names "weather" and/or "solunar" -- both are always computable
 * (weather from the forecast lookup, solunar from lat/lng) and never gate a
 * candidate out on their own.
 */
export function isViabilityUnmet(flags: ViabilityInputFlags, externalIds: LocationExternalIdsLike | null | undefined): boolean {
  if (!flags.configured) return false;
  const wantsAnyDataBackedInput = flags.wantsRiverFlow || flags.wantsOdfw || flags.wantsTide;
  if (!wantsAnyDataBackedInput) return false;

  const hasUsgs = Boolean(externalIds?.usgs_gauge);
  const hasOdfw = Boolean(externalIds?.odfw_zone_url);
  const hasTide = Boolean(externalIds?.noaa_station);
  const satisfiesAny = (flags.wantsRiverFlow && hasUsgs) || (flags.wantsOdfw && hasOdfw) || (flags.wantsTide && hasTide);
  return !satisfiesAny;
}
