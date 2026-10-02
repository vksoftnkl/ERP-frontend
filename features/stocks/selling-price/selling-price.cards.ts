/**
 * The words around the grid — the Qt screen's `refreshTitle`,
 * `refreshRowCard` and `refreshFourCard`, as pure text builders.
 */
import { formatCurrency } from "@/domain/pricing";
import { levelNumbers } from "./selling-price.math";
import { gridCounts, isChanged, isNewRow, srcOfRow, type PriceGridRow } from "./selling-price.state";
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

// ---------------------------------------------------------------- the four card
export type FourCard = {
  enabled: boolean;
  which: string;
  markup: string;
  wot: string;
  price: string;
  margin: string;
  cess: boolean;
};

/** One level of the current row as its four numbers. */
export function fourCard(
  row: PriceGridRow | null,
  index: number,
  level: number,
  levelNames: readonly string[],
  saving: boolean,
): FourCard {
  if (!row || !row.itemId) {
    return {
      enabled: false,
      which: "move onto a row to see its numbers",
      markup: "",
      wot: "",
      price: "",
      margin: "",
      cess: false,
    };
  }
  const price = row.prices[level] ?? 0;
  const numbers = levelNumbers(price, row.cost, row.taxPerc);
  return {
    enabled: !saving,
    which: `${levelNames[level] ?? ""} · row ${index + 1} · ${row.itemName} · tax ${formatCurrency(
      row.taxPerc,
      2,
      true,
    )}%`,
    markup: numbers.markup.toFixed(1),
    wot: numbers.wot.toFixed(2),
    price: numbers.price.toFixed(2),
    margin: numbers.margin.toFixed(1),
    cess: row.hasCess,
  };
}

// ---------------------------------------------------------------- the band header
/** The text over one level's columns: "WHOLESALE  (A)". */
export function levelBandText(name: string | undefined, letter: string): string {
  const upper = (name ?? "").toUpperCase();
  return `${upper || "LEVEL"}  (${letter})`;
}
