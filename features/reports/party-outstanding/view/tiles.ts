/**
 * `/parties.tiles` → the six tiles (plan §7). They cover ALL filtered rows,
 * not the page, because the server computed them that way. Every value and
 * every number in a caption is the server's. "Above N days" takes N from the
 * server too (the third bucket edge), since the buckets are the user's.
 */
import { displayDate } from "@/features/reports/shared/wire/dates";
import { formatAmount, formatBal, isZeroAmount } from "@/features/reports/shared/wire/money";
import type { OutstandingSide, PartyTiles } from "../wire/types";
import { onAccountSideOf, type Tone } from "./cells";

export type TileId = "net" | "overdue" | "above" | "onAccount" | "pdc" | "dueNext";

export type Tile = {
  id: TileId;
  heading: string;
  value: string;
  caption: string;
  /** The tile's stripe and value colour. */
  tone: Tone | "teal";
  /** A click narrows the report (plan §7, phase 3). */
  shortcut: boolean;
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** `2026-09-26` → `26-09`. */
function dayMonth(iso: string): string {
  return displayDate(iso).slice(0, 5);
}

export function buildTiles(tiles: PartyTiles, ctx: { side: OutstandingSide; deductPdc: boolean }): Tile[] {
  const netOnAccount = !isZeroAmount(tiles.net.amount) && tiles.net.side === onAccountSideOf(ctx.side);
  return [
    {
      id: "net",
      heading: "Net outstanding",
      value: formatBal(tiles.net),
      caption: `${plural(tiles.parties, "party", "parties")} · ${plural(tiles.bills, "bill", "bills")}`,
      tone: netOnAccount ? "credit" : "accent",
      shortcut: false,
    },
    {
      id: "overdue",
      heading: "Overdue",
      value: formatAmount(tiles.overdue),
      caption: `${tiles.overduePctOfOwed}% of pending bills`,
      tone: "danger",
      shortcut: true,
    },
    {
      id: "above",
      heading: `Above ${tiles.aboveDays.days} days`,
      value: formatAmount(tiles.aboveDays.amount),
      caption: plural(tiles.aboveDays.parties, "party", "parties"),
      tone: "orange",
      shortcut: true,
    },
    {
      id: "onAccount",
      heading: "On-account credit",
      value: formatAmount(tiles.onAccount),
      caption: "advances + unadjusted notes",
      tone: "credit",
      shortcut: false,
    },
    {
      id: "pdc",
      heading: "PDC in hand",
      value: formatAmount(tiles.pdcInHand.amount),
      caption: `${plural(tiles.pdcInHand.cheques, "cheque", "cheques")} · ${ctx.deductPdc ? "deducted" : "not deducted"}`,
      tone: "info",
      shortcut: false,
    },
    {
      id: "dueNext",
      heading: `Due next ${tiles.dueNext.days} days`,
      value: formatAmount(tiles.dueNext.amount),
      caption: `${dayMonth(tiles.dueNext.from)} → ${dayMonth(tiles.dueNext.to)}`,
      tone: "teal",
      shortcut: false,
    },
  ];
}

/**
 * Above N → the bucket that starts after edge N, for a sort. With Age by Due
 * date a "Not due" bucket comes first, so the labels run one longer than the
 * edges plus one, and the index moves along with them.
 */
export function bucketAfterEdge(days: number, edges: readonly number[], labelCount: number): number | null {
  const at = edges.indexOf(days);
  if (at < 0) return null;
  const offset = labelCount - (edges.length + 1);
  const index = at + 1 + Math.max(0, offset);
  return index < labelCount ? index : null;
}
