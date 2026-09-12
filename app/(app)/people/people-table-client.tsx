"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Phone, Plus, Search } from "lucide-react";
import type { RelationshipType, SuggestionStatus } from "@/lib/db/database.types";
import type { RhythmTier } from "@/lib/people/rhythm";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { TableRow, RhythmCell } from "@/components/ui/table-row";
import { EmptyState } from "@/components/ui/empty-state";
import { Sheet } from "@/components/ui/sheet";

// F3 (audit pass 2026-09-11): "No search, sort or filter on People beyond
// four tabs... make most-overdue the default sort." Lower rank sorts
// first; a person with no cadence tracked reads as "settled" already (see
// PersonTableRow's own construction in page.tsx), so it naturally sorts
// after anyone genuinely slipping/warning without a separate case here.
const RHYTHM_TIER_RANK: Record<RhythmTier, number> = { slipping: 0, warning: 1, settled: 2 };

export interface PersonTableRow {
  id: string;
  name: string;
  fullName: string;
  relationshipType: RelationshipType;
  isChildcareProvider: boolean;
  rhythmLabel: string;
  rhythmTier: RhythmTier;
  rhythmHealthPct: number;
  hasCadence: boolean;
  lastContact: string;
  nextThing: string;
  phone: string | null;
  notes: string | null;
  interests: string[];
  giftShortlist: { id: string; title: string; priceCents: number; status: SuggestionStatus }[];
}

const RELATIONSHIP_LABELS: Record<RelationshipType, string> = {
  self: "You",
  child: "Child",
  spouse: "Spouse",
  partner: "Partner",
  co_parent: "Co-parent",
  parent: "Parent",
  sibling: "Sibling",
  extended_family: "Extended family",
  friend: "Friend",
  colleague: "Colleague",
  other: "Other",
};

type Tab = "circle" | "kids" | "childcare" | "archive";
const TABS: { value: Tab; label: string }[] = [
  { value: "circle", label: "Circle" },
  { value: "kids", label: "Kids & custody" },
  { value: "childcare", label: "Childcare" },
  { value: "archive", label: "Archive" },
];

// Redesign Part 6 (768-1279px tier): "On People the detail pane becomes a
// slide-over sheet" -- below the xl breakpoint (matches the xl: prefix
// used everywhere else in this file for the same 1280px cutoff) a row
// click opens the Sheet instead of just updating the always-visible
// inline pane, since there's no room for both a full table and a 320px
// pane inline below that width.
function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia("(min-width: 1280px)");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsDesktop(mql.matches);
    const onChange = () => setIsDesktop(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);
  return isDesktop;
}

export function PeopleTableClient({ rows, archivedRows }: { rows: PersonTableRow[]; archivedRows: PersonTableRow[] }) {
  const [tab, setTab] = useState<Tab>("circle");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(rows[0]?.id ?? null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const isDesktop = useIsDesktop();

  const visibleRows = useMemo(() => {
    const base = (() => {
      switch (tab) {
        case "kids":
          return rows.filter((r) => r.relationshipType === "child");
        case "childcare":
          return rows.filter((r) => r.isChildcareProvider);
        case "archive":
          return archivedRows;
        default:
          return rows;
      }
    })();
    const trimmedQuery = query.trim().toLowerCase();
    const filtered = trimmedQuery
      ? base.filter(
          (r) => r.name.toLowerCase().includes(trimmedQuery) || r.fullName.toLowerCase().includes(trimmedQuery)
        )
      : base;
    // F3: most-overdue first by default -- fine at five people, matters at fifty.
    return [...filtered].sort((a, b) => {
      const tierDiff = RHYTHM_TIER_RANK[a.rhythmTier] - RHYTHM_TIER_RANK[b.rhythmTier];
      return tierDiff !== 0 ? tierDiff : a.rhythmHealthPct - b.rhythmHealthPct;
    });
  }, [tab, query, rows, archivedRows]);

  const selected = rows.find((r) => r.id === selectedId) ?? visibleRows[0] ?? null;

  return (
    <div className="flex flex-col gap-[18px] xl:flex-row xl:items-start">
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <SegmentedControl aria-label="Filter people" options={TABS} value={tab} onChange={setTab} />

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-meta" aria-hidden="true" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search people…"
            aria-label="Search people"
            className="max-w-md pl-9"
          />
        </div>

        {visibleRows.length === 0 ? (
          <EmptyState
            message={
              query.trim()
                ? `No one matches "${query.trim()}".`
                : tab === "archive"
                  ? "No one archived."
                  : tab === "childcare"
                    ? "No childcare providers tagged yet. Tag someone as a provider from their page."
                    : tab === "kids"
                      ? "No kids added yet."
                      : "No one added yet. Add the people in your life to start getting gift reminders and contact nudges."
            }
          />
        ) : (
          <div className="flex flex-col gap-2 overflow-x-auto">
            {visibleRows.map((row) => (
              <button
                key={row.id}
                type="button"
                onClick={() => {
                  setSelectedId(row.id);
                  if (!isDesktop) setSheetOpen(true);
                }}
                className="text-left"
              >
                <TableRow
                  slipping={row.rhythmTier === "slipping"}
                  className={selected?.id === row.id ? "border-line-strong" : undefined}
                  person={
                    <div className="flex items-center gap-2.5">
                      <Avatar name={row.name} size={36} />
                      <div className="min-w-0">
                        <p className="truncate font-sans text-row-label text-ink">{row.name}</p>
                        <p className="truncate font-sans text-metadata text-meta">{RELATIONSHIP_LABELS[row.relationshipType]}</p>
                      </div>
                    </div>
                  }
                  rhythm={row.hasCadence ? <RhythmCell label={row.rhythmLabel} healthPct={row.rhythmHealthPct} tier={row.rhythmTier} /> : null}
                  lastContact={row.hasCadence ? row.lastContact : null}
                  nextThing={row.nextThing === "—" ? null : row.nextThing}
                  action={
                    <Button asChild size="sm" variant={row.rhythmTier === "slipping" ? "default" : "ghost"}>
                      <Link href={`/people/${row.id}`}>{row.rhythmTier === "slipping" ? "Reach out" : "Open"}</Link>
                    </Button>
                  }
                />
              </button>
            ))}
          </div>
        )}
      </div>

      {selected && (
        <div className="hidden rounded-card border border-line bg-surface p-[18px] xl:block xl:w-[320px] xl:shrink-0">
          <PersonDetailPaneContent person={selected} />
        </div>
      )}

      {/* Redesign Part 6 (768-1279px tier): the same pane content, as a
          slide-over sheet below xl instead of an inline column -- see
          useIsDesktop above. Mounted unconditionally (cheap, and Sheet
          itself no-ops until `open`) so the row-click handler doesn't need
          to know which mode it's in beyond the isDesktop gate. */}
      <Sheet open={sheetOpen && !isDesktop} onClose={() => setSheetOpen(false)} title={selected?.name ?? "Person"}>
        {selected && <PersonDetailPaneContent person={selected} />}
      </Sheet>
    </div>
  );
}

function PersonDetailPaneContent({ person }: { person: PersonTableRow }) {
  return (
    <>
      <div className="flex items-center gap-3">
        <Avatar name={person.name} size={44} />
        <div className="min-w-0">
          <p className="truncate font-sans text-card-headline text-ink">{person.name}</p>
          <p className="truncate font-sans text-metadata text-meta">{RELATIONSHIP_LABELS[person.relationshipType]}</p>
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        {person.phone ? (
          <Button asChild size="sm">
            <Link href={`sms:${person.phone}`}>Text</Link>
          </Button>
        ) : (
          <Button size="sm" disabled title="No phone number on file">
            Text
          </Button>
        )}
        {person.phone ? (
          <Button asChild size="sm" variant="ghost">
            <Link href={`tel:${person.phone}`}>
              <Phone className="size-3.5" /> Call
            </Link>
          </Button>
        ) : (
          <Button size="sm" variant="ghost" disabled title="No phone number on file">
            <Phone className="size-3.5" /> Call
          </Button>
        )}
        <Button asChild size="icon" variant="ghost">
          <Link href={`/people/${person.id}`} aria-label="Open full profile">
            <Plus className="size-4" />
          </Link>
        </Button>
      </div>

      {person.interests.length > 0 && (
        <div className="mt-5">
          <p className="font-sans text-section-label uppercase text-meta">Interests</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {person.interests.map((interest) => (
              <Badge key={interest} variant="secondary">
                {interest}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {person.giftShortlist.length > 0 && (
        <div className="mt-5">
          <p className="font-sans text-section-label uppercase text-meta">Gift shortlist</p>
          <div className="mt-2 flex flex-col gap-2">
            {person.giftShortlist.map((gift) => (
              <div key={gift.id} className="flex items-center justify-between gap-2">
                <p className="truncate font-sans text-body text-ink">{gift.title}</p>
                <span className="shrink-0 font-sans text-metadata text-meta">${(gift.priceCents / 100).toFixed(0)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {person.notes && (
        <div className="mt-5 border-t border-line pt-4">
          <p className="font-sans text-section-label uppercase text-meta">Last note</p>
          <p className="mt-2 font-sans text-body text-ink-2">&ldquo;{person.notes}&rdquo;</p>
        </div>
      )}
    </>
  );
}
