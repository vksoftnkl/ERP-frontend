/**
 * The two chip kinds: a party's flags (CHQ BOUNCED, > 180 DAYS, ADVANCE,
 * OVER LIMIT) and a bill's type (OPENING, SALES, CR NOTE …). Their words and
 * tones come from `view/cells.ts`; this only draws them.
 */
import type { Chip } from "../view/cells";
import { chipClass } from "./tone";

export function ChipView({ chip }: { chip: Chip }) {
  return (
    <span className={chipClass(chip.tone)} title={chip.title}>
      {chip.label}
    </span>
  );
}

export function PartyFlags({ flags }: { flags: readonly Chip[] }) {
  if (flags.length === 0) return null;
  return (
    <>
      {flags.map((flag) => (
        <ChipView key={flag.label} chip={flag} />
      ))}
    </>
  );
}
