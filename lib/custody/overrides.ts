// D-130: reconciles a newly created/edited custody block against any
// existing custody_blocks for the same child that overlap its span.
//
// Root cause this fixes: custody_blocks rows from a recurring schedule
// (materializeCustodySchedule) and manually created one-off blocks (a
// vacation override, a holiday swap) have always coexisted additively —
// nothing ever reconciled them when their date ranges overlapped for the
// same child. Every reader (the calendar grid, the
// calendar_hide_other_parent_custody filter, brief generation) just saw
// both rows and had no way to know which one was authoritative. In
// practice this meant creating a one-off "kids are with the other parent
// this weekend" override left the regular schedule's block for the same
// days sitting right next to it — and when calendar_hide_other_parent_custody
// is on (the default, D-128), the filter hides the override (responsible
// person is the OTHER parent) while keeping the stale regular block
// (responsible person is the viewer), so the calendar kept showing "you
// have the kids" for a weekend the user had just overridden away.
//
// The fix: whichever block is being created or edited is the more
// specific, more recently expressed intent for its exact span — per the
// project's own rule ("where two parts of the app disagree, make one the
// single source of truth"), it wins for that span. Any existing block for
// the same child that overlaps gets trimmed, split, or removed so exactly
// one row governs any given instant. This applies uniformly whether the
// pre-existing block came from a schedule or was itself a prior one-off —
// same resolution logic either way.
import type { SupabaseClient } from "@supabase/supabase-js";
import { custodyBlocksRepo } from "../db/repositories/calendar";
import { listCustodyBlocksForChildInRange } from "../db/repositories/calendar";
import type { CustodyBlockRow } from "../db/database.types";

export interface CustodyOverrideRange {
  childPersonId: string;
  startsAt: string; // ISO
  endsAt: string; // ISO
  // When editing an existing one-off block, exclude it from being
  // reconciled against itself.
  excludeBlockId?: string;
}

export type CustodyOverrideResolution =
  | { action: "delete"; blockId: string }
  | { action: "truncate_end"; blockId: string; newEndsAt: string }
  | { action: "truncate_start"; blockId: string; newStartsAt: string }
  // The override falls entirely inside an existing block's span: the
  // existing block is truncated in place to the "before" segment and a
  // new row is created for the "after" segment, preserving the original
  // block's other fields (responsible person, type, notes, location,
  // custody_schedule_id).
  | { action: "split"; blockId: string; beforeEndsAt: string; afterStartsAt: string };

/**
 * Pure decision function: given the existing custody blocks that overlap
 * `override`'s span for the same child (already fetched — see
 * reconcileCustodyBlockOverride below for the DB-backed wrapper), returns
 * what should happen to each one so the override becomes the sole
 * authority for its own span. Blocks with no actual overlap, a different
 * child, or matching `excludeBlockId` are ignored (the caller is expected
 * to have already scoped the query, but this stays defensive so unit
 * tests can exercise it directly with an unfiltered list too).
 */
export function resolveCustodyBlockOverrides(
  existingBlocks: CustodyBlockRow[],
  override: CustodyOverrideRange
): CustodyOverrideResolution[] {
  const oStart = new Date(override.startsAt).getTime();
  const oEnd = new Date(override.endsAt).getTime();
  const resolutions: CustodyOverrideResolution[] = [];

  for (const existing of existingBlocks) {
    if (existing.child_person_id !== override.childPersonId) continue;
    if (override.excludeBlockId && existing.id === override.excludeBlockId) continue;

    const eStart = new Date(existing.starts_at).getTime();
    const eEnd = new Date(existing.ends_at).getTime();

    const overlaps = eStart < oEnd && eEnd > oStart;
    if (!overlaps) continue;

    const containedInOverride = eStart >= oStart && eEnd <= oEnd;
    const overrideInsideExisting = eStart < oStart && eEnd > oEnd;
    const extendsBeforeOnly = eStart < oStart && eEnd <= oEnd;
    // extendsAfterOnly is the remaining case (eStart >= oStart && eEnd > oEnd).

    if (containedInOverride) {
      resolutions.push({ action: "delete", blockId: existing.id });
    } else if (overrideInsideExisting) {
      resolutions.push({
        action: "split",
        blockId: existing.id,
        beforeEndsAt: override.startsAt,
        afterStartsAt: override.endsAt,
      });
    } else if (extendsBeforeOnly) {
      resolutions.push({ action: "truncate_end", blockId: existing.id, newEndsAt: override.startsAt });
    } else {
      resolutions.push({ action: "truncate_start", blockId: existing.id, newStartsAt: override.endsAt });
    }
  }

  return resolutions;
}

/**
 * Applies resolutions computed by resolveCustodyBlockOverrides. `blocksById`
 * must contain every block referenced by a resolution (the same list
 * passed into resolveCustodyBlockOverrides, keyed by id) — needed for the
 * split case, which carries over the original block's other fields onto
 * the new "after" row.
 */
export async function applyCustodyBlockOverrides(
  client: SupabaseClient,
  blocksById: Map<string, CustodyBlockRow>,
  resolutions: CustodyOverrideResolution[]
): Promise<void> {
  for (const resolution of resolutions) {
    switch (resolution.action) {
      case "delete":
        await custodyBlocksRepo.remove(client, resolution.blockId);
        break;
      case "truncate_end":
        await custodyBlocksRepo.update(client, resolution.blockId, { ends_at: resolution.newEndsAt });
        break;
      case "truncate_start":
        await custodyBlocksRepo.update(client, resolution.blockId, { starts_at: resolution.newStartsAt });
        break;
      case "split": {
        const original = blocksById.get(resolution.blockId);
        if (!original) break;
        await custodyBlocksRepo.update(client, resolution.blockId, { ends_at: resolution.beforeEndsAt });
        await custodyBlocksRepo.create(client, {
          household_id: original.household_id,
          child_person_id: original.child_person_id,
          responsible_person_id: original.responsible_person_id,
          starts_at: resolution.afterStartsAt,
          ends_at: original.ends_at,
          block_type: original.block_type,
          notes: original.notes,
          location: original.location,
          custody_schedule_id: original.custody_schedule_id,
        });
        break;
      }
    }
  }
}

/**
 * DB-backed convenience wrapper: fetches the child's overlapping blocks,
 * resolves, and applies — the one call POST/PATCH one-off custody routes
 * need before writing the block that expresses the override.
 */
export async function reconcileCustodyBlockOverride(
  client: SupabaseClient,
  override: CustodyOverrideRange
): Promise<void> {
  const existingBlocks = await listCustodyBlocksForChildInRange(
    client,
    override.childPersonId,
    override.startsAt,
    override.endsAt
  );
  const resolutions = resolveCustodyBlockOverrides(existingBlocks, override);
  if (resolutions.length === 0) return;
  const blocksById = new Map(existingBlocks.map((b) => [b.id, b]));
  await applyCustodyBlockOverrides(client, blocksById, resolutions);
}
