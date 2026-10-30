/**
 * Reorder → PO — the screen's rules, pure (Qt `PurchaseReorderEntry`, NexERP
 * 6c6b5c2). The server suggests what to buy and from whom; the operator ticks
 * rows (✓ / Space), adjusts Order qty / Rate, sets a supplier for the ticked
 * ones, and "Create POs" makes one DRAFT PO per supplier.
 */
import { num, qtyText, text } from "@/features/purchase/shared/purchase.format";
import type { UiTableColumnRow } from "@/features/sales/quotation/quotation.types";
import { COL, REORDER_COLUMN_NUMBERS, REORDER_FALLBACK_COLUMNS } from "./reorder.constants";
import type { CreateReorderPosDto, ReorderRow, ReorderSuggestion, ReorderSummary } from "./reorder.types";

/** A decimal as the grid shows it: up to `places`, trailing zeros trimmed; 0 / blank → "". */
function decText(value: number, places: number): string {
  if (!Number.isFinite(value) || value === 0) {
    return "";
  }
  return value.toFixed(places).replace(/\.?0+$/, "");
}

const SOURCE_WORD: Record<string, string> = { PREFERRED: "preferred", LAST_BILL: "last bill" };

/** Qt `fill`: rows below their level, with a qty and a supplier, come ticked. */
export function rowsFromSuggestions(suggestions: readonly ReorderSuggestion[]): ReorderRow[] {
  return suggestions.map((s, index) => {
    const qty = num(s.suggestedQty);
    const supplierId = text(s.supplierId);
    const level = num(s.reorderLevel) > 0 ? num(s.reorderLevel) : num(s.minLevel);
    return {
      key: text(s.reorderId) || `${text(s.itemId)}|${text(s.uomId)}|${text(s.godownId)}|${index}`,
      ticked: s.below === true && qty > 0 && supplierId !== "",
      itemId: text(s.itemId),
      itemName: text(s.itemName),
      uomId: text(s.uomId),
      unitName: text(s.unitName),
      godownName: text(s.godownName),
      onHand: num(s.onHand),
      onOrder: num(s.onOrder),
      level,
      max: num(s.maxLevel),
      orderQty: decText(qty, 3),
      rate: num(s.rate) > 0 ? num(s.rate).toFixed(2) : "",
      supplierId,
      supplierName: text(s.supplierName),
      source: SOURCE_WORD[text(s.supplierSource).toUpperCase()] ?? "",
      lastBought: text(s.lastPurchaseDate).slice(0, 10),
      below: s.below === true,
    };
  });
}

export function toggleTick(rows: readonly ReorderRow[], key: string): ReorderRow[] {
  return rows.map((row) => (row.key === key ? { ...row, ticked: !row.ticked } : row));
}

/** Qt "Tick all": ticks every row when any is unticked, else unticks them all. */
export function tickAll(rows: readonly ReorderRow[]): ReorderRow[] {
  const on = rows.some((row) => !row.ticked);
  return rows.map((row) => (row.ticked === on ? row : { ...row, ticked: on }));
}

/** "Tick all" or "Untick all", as the button reads. */
export function tickAllLabel(rows: readonly ReorderRow[]): string {
  return rows.length > 0 && rows.every((row) => row.ticked) ? "Untick all" : "Tick all";
}

export const QTY_PATTERN = /^\d*(\.\d{0,3})?$/;
export const RATE_PATTERN = /^\d*(\.\d{0,4})?$/;

/** Qt `cellEdited`: keying an order qty ticks the row; 0 (or blank) unticks it. */
export function editOrderQty(rows: readonly ReorderRow[], key: string, raw: string): ReorderRow[] {
  const value = raw.replace(/,/g, "").trim();
  if (!QTY_PATTERN.test(value)) {
    return rows as ReorderRow[];
  }
  return rows.map((row) => (row.key === key ? { ...row, orderQty: value, ticked: num(value) > 0 } : row));
}

export function editRate(rows: readonly ReorderRow[], key: string, raw: string): ReorderRow[] {
  const value = raw.replace(/,/g, "").trim();
  if (!RATE_PATTERN.test(value)) {
    return rows as ReorderRow[];
  }
  return rows.map((row) => (row.key === key ? { ...row, rate: value } : row));
}

/** Qt `setSupplierForTicked`: the ticked rows are bought from this supplier ("set"). */
export function setSupplierForTicked(
  rows: readonly ReorderRow[],
  supplierId: string,
  supplierName: string,
): { rows: ReorderRow[]; count: number } {
  let count = 0;
  const next = rows.map((row) => {
    if (!row.ticked) {
      return row;
    }
    count += 1;
    return { ...row, supplierId, supplierName, source: "set" };
  });
  return { rows: next, count };
}

/** Qt `updateSummary`. */
export function summarize(rows: readonly ReorderRow[]): ReorderSummary {
  const suppliers = new Set<string>();
  let ticked = 0;
  let value = 0;
  let withoutSupplier = 0;
  for (const row of rows) {
    if (!row.ticked) {
      continue;
    }
    ticked += 1;
    if (row.supplierId) {
      suppliers.add(row.supplierId);
    } else {
      withoutSupplier += 1;
    }
    value += num(row.orderQty) * num(row.rate);
  }
  return { ticked, pos: suppliers.size, value, withoutSupplier };
}

/** Qt `createPos`'s checks: every ticked row needs a supplier and a qty. */
export function createProblems(rows: readonly ReorderRow[]): string[] {
  const problems: string[] = [];
  for (const row of rows) {
    if (!row.ticked) {
      continue;
    }
    if (!row.supplierId) {
      problems.push(`${row.itemName}: no supplier`);
    } else if (num(row.orderQty) <= 0) {
      problems.push(`${row.itemName}: no order qty`);
    }
  }
  return problems;
}

/** The create body (Qt `createPos`) — null when nothing is ticked. */
export function createBody(
  rows: readonly ReorderRow[],
  scope: Pick<CreateReorderPosDto, "companyId" | "branchId" | "accYear" | "deviceId">,
): CreateReorderPosDto | null {
  const picked = rows
    .filter((row) => row.ticked && row.supplierId && num(row.orderQty) > 0)
    .map((row) => {
      const rate = num(row.rate);
      return {
        itemId: row.itemId,
        uomId: row.uomId,
        qty: num(row.orderQty),
        supplierId: row.supplierId,
        ...(rate > 0 ? { rate } : {}),
      };
    });
  return picked.length > 0 ? { ...scope, rows: picked } : null;
}

/** The figures as the grid shows them (Qt `fill`). */
export function cellText(row: ReorderRow, column: number): string {
  switch (column) {
    case COL.OnHand:
      return qtyText(row.onHand);
    case COL.OnOrder:
      return row.onOrder > 0 ? qtyText(row.onOrder) : "";
    case COL.Level:
      return qtyText(row.level);
    case COL.Max:
      return row.max > 0 ? qtyText(row.max) : "";
    default:
      return "";
  }
}

// ---------------------------------------------------------------------------
// Columns — ui_table 64's layout over the columns this screen draws
// ---------------------------------------------------------------------------

export type ReorderGridColumn = {
  no: number;
  header: string;
  /** Share of the grid's width, in percent; the drawn columns sum to 100. */
  widthPct: number;
};

/**
 * Pure. The layout supplies titles, widths (the Qt FRACTION, normalised to
 * shares of 100), order and visibility; a column number the screen does not
 * know is never drawn, and the hidden carriers are fields of the row.
 */
export function resolveReorderColumns(rows: readonly UiTableColumnRow[] | undefined): ReorderGridColumn[] {
  const byNumber = new Map<number, UiTableColumnRow>();
  for (const row of rows ?? []) {
    const no = Number.parseInt(String(row.uiTblClmNo ?? ""), 10);
    if (Number.isFinite(no) && !byNumber.has(no)) {
      byNumber.set(no, row);
    }
  }
  const placed: { no: number; header: string; width: number; position: number }[] = [];
  for (const no of REORDER_COLUMN_NUMBERS) {
    const row = byNumber.get(no);
    const fallback = REORDER_FALLBACK_COLUMNS[no];
    // The tick column is the screen's own handle — never hidden by a layout.
    if (row && row.uiTblClmColumnVisibility === false && no !== COL.Tick) {
      continue;
    }
    const stored = row && typeof row.uiTblClmColumnWidth === "number" && row.uiTblClmColumnWidth > 0 ? row.uiTblClmColumnWidth : 0;
    placed.push({
      no,
      header: (row?.uiTblClmName ?? "").trim() || fallback?.title || "",
      width: stored || fallback?.width || 6,
      position: row && Number.isFinite(Number(row.uiTblClmColumnPosition)) ? Number(row.uiTblClmColumnPosition) : no,
    });
  }
  placed.sort((left, right) => left.position - right.position || left.no - right.no);
  const total = placed.reduce((sum, column) => sum + column.width, 0) || 1;
  return placed.map((column) => ({ no: column.no, header: column.header, widthPct: (column.width / total) * 100 }));
}
