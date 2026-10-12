/**
 * `summary.tiles[]` → what each tile prints (plan §7.1), in the server's
 * order. The tile set is the server's (codes, not client sums of rows); an
 * unknown code is shown with its code as the heading.
 */
import { formatAmount } from "@/features/reports/shared/wire/money";
import type { Tile } from "../wire/types";
import { formatNatural, NO_BALANCE, plural, signedNet } from "./cells";

export type TileTone = "sales" | "returns" | "receipts" | "payments" | "expenses" | "cash" | "neutral";

export type TileView = {
  code: string;
  heading: string;
  value: string;
  sub: string;
  tone: TileTone;
};

const KNOWN: Record<string, { heading: string; one: string; many: string; tone: TileTone }> = {
  SALES: { heading: "Sales", one: "bill", many: "bills", tone: "sales" },
  SALE_RETURNS: { heading: "Sale returns", one: "return", many: "returns", tone: "returns" },
  RECEIPTS: { heading: "Receipts", one: "receipt", many: "receipts", tone: "receipts" },
  PAYMENTS: { heading: "Payments", one: "payment", many: "payments", tone: "payments" },
  EXPENSES: { heading: "Expenses", one: "expense", many: "expenses", tone: "expenses" },
  CASH_IN_HAND: { heading: "Cash in hand", one: "voucher", many: "vouchers", tone: "cash" },
};

function countSub(tile: Tile, one: string, many: string, countDrafts: boolean): string {
  const drafts = countDrafts ? (tile.drafts ?? 0) : 0;
  const parts: string[] = [];
  // With drafts beside them, the counted ones read "posted" (the mockup).
  if (tile.vouchers !== null) parts.push(drafts ? `${tile.vouchers.toLocaleString("en-IN")} posted` : plural(tile.vouchers, one, many));
  if (drafts) parts.push(plural(drafts, "draft", "drafts"));
  if (tile.cancelledPairs) parts.push(plural(tile.cancelledPairs, "cancelled pair", "cancelled pairs"));
  return parts.join(" · ");
}

/**
 * "opening 48,250.00 · +21,600.00": the sign is the net's side (Dr = +), not
 * a subtraction. Under a voucher-type filter there is no opening (a balance
 * has no type), so the net stands alone and says why.
 */
function balanceSub(tile: Tile): string {
  const parts: string[] = [];
  if (tile.opening) parts.push(`opening ${formatNatural(tile.opening)}`);
  if (tile.net) parts.push(tile.opening ? signedNet(tile.net) : `net ${signedNet(tile.net)}`);
  if (!tile.opening && !tile.closing) parts.push("no balance for one type");
  return parts.join(" · ");
}

export function buildTiles(tiles: readonly Tile[], opts: { countDrafts: boolean }): TileView[] {
  return tiles.map((tile) => {
    const known = KNOWN[tile.code];
    const isBalance = tile.amount === null && (tile.closing !== null || tile.opening !== null || tile.net !== null);
    const value =
      tile.amount !== null ? formatAmount(tile.amount) : tile.closing ? formatNatural(tile.closing) : isBalance ? NO_BALANCE : "";
    return {
      code: tile.code,
      heading: known?.heading ?? tile.code,
      value,
      sub: isBalance ? balanceSub(tile) : countSub(tile, known?.one ?? "voucher", known?.many ?? "vouchers", opts.countDrafts),
      tone: known?.tone ?? "neutral",
    };
  });
}

const NATURE_LABEL: Record<string, string> = {
  SALES: "Sales",
  CREDIT_NOTE: "Credit notes & returns",
  RECEIPT: "Receipts",
  PAYMENT: "Payments (with expenses)",
  JOURNAL: "Journals",
  CONTRA: "Contras",
  DEBIT_NOTE: "Debit notes",
  PURCHASE: "Purchases",
  STOCK_JOURNAL: "Stock journals",
};

/** A nature filter's chip: its words, or the nature as sent. */
export function natureLabel(nature: string): string {
  return NATURE_LABEL[nature] ?? nature;
}
