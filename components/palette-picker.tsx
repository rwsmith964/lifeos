"use client";

import { PALETTES, PALETTE_LABELS, usePalette } from "@/components/palette-provider";
import { SegmentedControl } from "@/components/ui/segmented-control";

// Redesign (Part 4): "Add a palette picker in Settings under Appearance,
// next to Light/Dark/System." Built on the same shared SegmentedControl as
// ThemeToggle so the two controls read as one family, not two different
// widgets bolted together.
export function PalettePicker() {
  const { palette, setPalette } = usePalette();

  return (
    <SegmentedControl
      aria-label="Colour palette"
      options={PALETTES.map((p) => ({ value: p, label: PALETTE_LABELS[p] }))}
      value={palette}
      onChange={setPalette}
    />
  );
}
