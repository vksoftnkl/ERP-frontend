/**
 * The words around the grid — the Qt screen's `refreshTitle`,
 * `refreshRowCard` and `refreshProfitLine`, as pure text builders.
 */
import { LEVEL_COUNT } from "./selling-price.constants";
import { exclusiveOfTax } from "./selling-price.math";
import {
  gridCounts,
  isChanged,
  isLevelOn,
  isNewRow,
  srcOfRow,
  type PriceGridRow,
} from "./selling-price.state";
import { money } from "./selling-price.validate";
import type { PriceScope } from "./selling-price.types";

// ---------------------------------------------------------------- the title
export function subtitleText(
  companyName: string,
  branchName: string,
  rows: readonly PriceGridRow[],
): string {
  const counts = gridCounts(rows);
  const changed = rows.filter(isChanged).length;
  const parts: string[] = [];
  parts.push(companyName);
  if (branchName) {
    parts.push(branchName);
  }
  parts.push(
    `${counts.items === 1 ? "1 item" : `${counts.items} items`}, ${
      counts.rows === 1 ? "1 row" : `${counts.rows} rows`
    }`,
  );
  parts.push(`${changed} changed`);
  parts.push("nothing is written until Save");
  return parts.join(" · ");
}

export function changedChipText(changed: number): string {
  return changed === 1 ? "1 ROW CHANGED" : `${changed} ROWS CHANGED`;
}

// ---------------------------------------------------------------- the row card
export type RowCard = {
  /** "new" paints the green card; "plain" the neutral one. */
  tone: "new" | "plain";
  title: string;
  note: string;
};

/**
 * What Save will do to the CURRENT row, in words — the server's scope table
 * (§5.5) read for this row and this switch.
 */
export function rowCard(row: PriceGridRow | null, index: number, scope: PriceScope): RowCard {
  const chain = scope === "CHAIN";
  if (!row || !row.itemId) {
    return {
      tone: "plain",
      title: "THE CURRENT ROW",
      note: "Move onto a row to see which row of the price table Save writes for it.",
    };
  }
  const lineNo = index + 1;
  const src = srcOfRow(row);
  const rowScope = row.priceScope;
  let tone: RowCard["tone"] = "plain";
  let title: string;
  let note = "";

  if (isNewRow(row)) {
    tone = "new";
    title = "NEW — A BUCKET NO ROW PRICES YET";
    const dims: string[] = [];
    if (row.bucketMrp !== null) {
      dims.push(`MRP ${money(row.bucketMrp)}`);
    }
    if (row.bucketSp !== null) {
      dims.push(`sale price ${money(row.bucketSp)}`);
    }
    note =
      `Row ${lineNo}: ${dims.length === 0 ? "type the MRP or sale price" : dims.join(", ")} for ${
        row.itemName
      }. Legal and useful. Save inserts it (${
        chain ? "as a chain row" : "for this branch"
      }), copying cess / loading / freight / godown from the headline row` +
      ((row.stock ?? 0) > 0
        ? ""
        : ", and the toast NAMES it: “has no stock on hand — the price applies when stock arrives”. Never plain “Saved”") +
      ".";
  } else if (src.startsWith("BUCKET")) {
    title =
      rowScope === "CHAIN" ? "BUCKET·CH — THE CHAIN ROW" : "BUCKET·BR — THIS BRANCH'S OWN ROW";
  } else {
    title = "MASTER — THE HEADLINE ROW";
  }

  if (!isNewRow(row)) {
    if (!rowScope) {
      note = chain
        ? "No row prices this yet. A chain row is created; every branch without its own override will read it."
        : "No row prices this yet. A row is created for this branch; no other branch is affected.";
    } else if (chain && rowScope === "BRANCH") {
      note =
        "This row is already a branch override, so All branches updates the override in place. The chain row is not created or changed, and no other branch moves.";
    } else if (chain) {
      note = "The chain row is updated. Every branch without its own override moves with it.";
    } else if (rowScope === "CHAIN") {
      note =
        "A branch override is created for this branch. The chain row is left untouched and every other branch keeps reading it.";
    } else {
      note = "This branch's own row is updated. No other branch is affected.";
    }
    if (title.startsWith("MASTER")) {
      note = "The item's ordinary price row — no MRP / sale-price bucket. " + note;
    }
  }

  // Which cost the markups work from (notes 75).
  const costs = `Cost ${money(row.cost)} (${money(row.costWot)} before tax)`;
  if (row.costBasis === "MRP") {
    note += `\n${costs} is the landing cost of the stock at MRP ${money(row.bucketMrp ?? 0)} only.`;
  } else if (row.costBasis === "ITEM") {
    note += `\n${costs} is the item's average over all its stock in this branch.`;
  } else if (row.costBasis === "PRICE_ROW") {
    note += `\n${costs} is the cost kept on the price row — this branch has no stock cost for it yet.`;
  }

  return { tone, title, note };
}

// ---------------------------------------------------------------- the profit line
/** One level on the profit line: "WS ₹10.00 (10.0%) ↑". */
export type ProfitPart = {
  /** The level's short code (WS, RET … — A..D until the names arrive). */
  level: string;
  /** "₹10.00", "-₹2.50" for a loss. */
  amount: string;
  /** On the cost before tax, one place: "10.0". */
  pct: string;
  loss: boolean;
  /** Moved since the row was loaded: the profit rose / fell. */
  moved: "up" | "down" | null;
};

export type ProfitLine =
  /** A sentence instead of figures: no row, no cost, no price. */
  | { kind: "note"; text: string }
  | {
      kind: "line";
      unit: string;
      parts: ProfitPart[];
      /** A per-unit cess is not a percentage of the price: the figures are close, not exact. */
      cess: boolean;
      /** One line per level, with the old profit where it moved. */
      tooltip: string;
    };

/**
 * What the current row's prices EARN without tax, under the grid — the item
 * card's Pricing line, which replaced the four-number card (Qt
 * `refreshProfitLine`, 2026-10-22): each switched-on level's price before tax
 * less the cost before tax, % on that cost; ↑ / ↓ = moved since the row was
 * loaded (the old figure is in the tooltip).
 */
export function profitLine(
  row: PriceGridRow | null,
  levelActive: readonly boolean[],
  levelShorts: readonly string[],
  levelNames: readonly string[],
): ProfitLine {
  if (!row || !row.itemId) {
    return { kind: "note", text: "Profit shows here for the row you are on." };
  }
  const costWot = row.costWot;
  if (costWot <= 0) {
    return { kind: "note", text: "No cost on this row, so no profit to show." };
  }
  const parts: ProfitPart[] = [];
  const tips: string[] = [];
  for (let level = 0; level < LEVEL_COUNT; level += 1) {
    const price = row.prices[level];
    if (!isLevelOn(levelActive, level) || price <= 0) {
      continue;
    }
    const profit = exclusiveOfTax(price, row.taxPerc) - costWot;
    const was = exclusiveOfTax(row.base[level], row.taxPerc) - costWot;
    const amount = `${profit < 0 ? "-₹" : "₹"}${Math.abs(profit).toFixed(2)}`;
    const pct = ((profit / costWot) * 100).toFixed(1);
    const moved = Math.abs(profit - was) >= 0.005 ? (profit > was ? "up" : "down") : null;
    parts.push({
      level: levelShorts[level] || String.fromCharCode(65 + level),
      amount,
      pct,
      loss: profit < 0,
      moved,
    });
    tips.push(
      `${levelNames[level] ?? ""}: price ₹${price.toFixed(2)}, profit ${amount} (${pct}%)` +
        (moved ? `, was ₹${was.toFixed(2)}` : ""),
    );
  }
  if (parts.length === 0) {
    return { kind: "note", text: "No price yet." };
  }
  return { kind: "line", unit: row.unitName, parts, cess: row.hasCess, tooltip: tips.join("\n") };
}

/** The line as plain text: "Profit per PCS (no tax):  WS ₹10.00 (10.0%) ↑  ·  RET ₹12.00 (12.0%)". */
export function profitLineText(line: ProfitLine): string {
  if (line.kind === "note") {
    return line.text;
  }
  const parts = line.parts.map(
    (part) =>
      `${part.level} ${part.amount} (${part.pct}%)${
        part.moved === "up" ? " ↑" : part.moved === "down" ? " ↓" : ""
      }`,
  );
  return (
    `Profit per ${line.unit} (no tax):  ${parts.join("  ·  ")}` +
    (line.cess ? "   (approximate — this item carries a cess)" : "")
  );
}

// ---------------------------------------------------------------- the band header
/** The text over one level's columns: "WHOLESALE  (A)". */
export function levelBandText(name: string | undefined, letter: string): string {
  const upper = (name ?? "").toUpperCase();
  return `${upper || "LEVEL"}  (${letter})`;
}
