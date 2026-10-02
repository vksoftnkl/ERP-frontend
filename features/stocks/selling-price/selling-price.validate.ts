/**
 * The strip under the grid (Qt `refreshValidation`): every red reason, then
 * one line for the amber ones. Red keeps Save off — the database would refuse
 * it anyway; amber alone is a question the save asks.
 */
import { formatCurrency } from "@/domain/pricing";
import { LEVEL_COUNT } from "./selling-price.constants";
import { PRICE_KEYS } from "./selling-price.constants";
import { isAdded, isChanged, rowMrp, verdictOf, type PriceGridRow } from "./selling-price.state";
import type { BelowCostPolicy } from "./selling-price.types";

/** QLocale money: two places, grouped. */
export function money(value: number): string {
  return formatCurrency(value, 2, true);
}

export type ValidationStrip = {
  /** Every red reason, in grid order. */
  red: string[];
  /** 1-based rows with a below-cost (amber) level. */
  amberRows: number[];
  /** The whole strip, as the label reads. "" = hidden. */
  text: string;
  tone: "red" | "amber";
  /** Red keeps Save off. */
  blocked: boolean;
};

const PRICE_EPSILON = 0.005;

/**
 * @param serverProblemRows 0-based rows the last 422 named — kept red until
 *        the operator edits them.
 */
export function validateRows(
  rows: readonly PriceGridRow[],
  levelNames: readonly string[],
  belowCostPolicy: BelowCostPolicy,
  serverProblemRows: ReadonlySet<number>,
): ValidationStrip {
  const red: string[] = [];
  const amberRows: number[] = [];
  const amberLevels = new Set<number>();

  rows.forEach((row, index) => {
    if (!isChanged(row)) {
      return;
    }
    const lineNo = index + 1;
    const mrp = rowMrp(row);
    const min = row.min;
    let amber = false;
    for (let level = 0; level < LEVEL_COUNT; level += 1) {
      const price = row.prices[level];
      const name = levelNames[level] ?? "";
      const verdict = verdictOf(row, PRICE_KEYS[level], belowCostPolicy);
      if (mrp > 0 && price > mrp + PRICE_EPSILON) {
        red.push(`Row ${lineNo} · ${name} ${money(price)} is above the row's MRP ${money(mrp)}.`);
      } else if (min > 0 && price + PRICE_EPSILON < min) {
        red.push(`Row ${lineNo} · ${name} ${money(price)} is below the row's minimum ${money(min)}.`);
      } else if (verdict === "red") {
        red.push(
          `Row ${lineNo} · ${name} ${money(price)} is below cost ${money(row.cost)} (below_cost_price = restrict).`,
        );
      } else if (verdict === "amber") {
        amber = true;
        amberLevels.add(level);
      }
    }
    if (isAdded(row) && row.bucketMrp === null && row.bucketSp === null) {
      red.push(`Row ${lineNo} · a NEW row needs its MRP or sale price — that is the bucket it prices.`);
    }
    if (amber) {
      amberRows.push(lineNo);
    }
  });

  const sortedProblems = Array.from(serverProblemRows).sort((left, right) => left - right);
  for (const index of sortedProblems) {
    if (!red.join("").includes(`Row ${index + 1} `)) {
      red.push(`Row ${index + 1} · refused by the server — see the message.`);
    }
  }

  let text = red.join("   ");
  if (amberRows.length > 0) {
    const which =
      amberRows.length === 1 ? `Row ${amberRows[0]}` : `Rows ${amberRows.join(", ")}`;
    const levels: string[] = [];
    for (let level = 0; level < LEVEL_COUNT; level += 1) {
      if (amberLevels.has(level)) {
        levels.push(levelNames[level] ?? "");
      }
    }
    text +=
      (text ? "   " : "") +
      `${which} · ${levels.join(" / ")} below cost — amber, Save asks (below_cost_price = ${belowCostPolicy}).`;
  }

  return {
    red,
    amberRows,
    text,
    tone: red.length === 0 ? "amber" : "red",
    blocked: red.length > 0,
  };
}

export const SAVE_TOOLTIP = "F5 / Ctrl+Enter — save the changed rows in one transaction.";
export const SAVE_BLOCKED_TOOLTIP =
  "Fix the red cells first — above MRP and below Min are never saved.";
