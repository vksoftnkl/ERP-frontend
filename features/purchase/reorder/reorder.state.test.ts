import { describe, expect, it } from "vitest";
import { COL } from "./reorder.constants";
import {
  cellText,
  createBody,
  createProblems,
  editOrderQty,
  editRate,
  resolveReorderColumns,
  rowsFromSuggestions,
  setSupplierForTicked,
  summarize,
  tickAll,
  tickAllLabel,
  toggleTick,
} from "./reorder.state";
import type { ReorderSuggestion } from "./reorder.types";

function suggestion(over: Partial<ReorderSuggestion>): ReorderSuggestion {
  return {
    reorderId: "r1",
    itemId: "i1",
    itemName: "SOAP",
    itemCode: null,
    uomId: "u1",
    unitName: "PCS",
    godownId: null,
    godownName: null,
    reorderType: null,
    onHand: "3.000",
    onOrder: "0.000",
    cover: "3.000",
    reorderLevel: "10",
    minLevel: "0",
    maxLevel: "0",
    reorderQty: "24",
    leadDays: 0,
    below: true,
    suggestedQty: "24",
    supplierId: "s1",
    supplierName: "ZT",
    supplierSource: "PREFERRED",
    supplierCode: null,
    rate: "12.5",
    lastPurchaseDate: "2026-10-20T00:00:00.000Z",
    ...over,
  };
}

const SCOPE = { companyId: "c1", branchId: "b1", accYear: "2026-2027", deviceId: "d1" };

describe("reorder → PO — rows", () => {
  it("below with a qty and a supplier comes ticked; the figures read as Qt's fill", () => {
    const [row, noSupplier, above] = rowsFromSuggestions([
      suggestion({}),
      suggestion({ reorderId: "r2", supplierId: null, supplierName: null, supplierSource: null }),
      suggestion({ reorderId: "r3", below: false, reorderLevel: "0", minLevel: "4", maxLevel: "40", onOrder: "6" }),
    ]);
    expect(row).toMatchObject({ ticked: true, orderQty: "24", rate: "12.50", source: "preferred", lastBought: "2026-10-20" });
    expect(noSupplier.ticked).toBe(false);
    expect(noSupplier.source).toBe("");
    expect(above.ticked).toBe(false);
    // Level falls back to min; Max and On order show only when set.
    expect(cellText(above, COL.Level)).toBe("4");
    expect(cellText(above, COL.Max)).toBe("40");
    expect(cellText(above, COL.OnOrder)).toBe("6");
    expect(cellText(row, COL.OnOrder)).toBe("");
    expect(cellText(row, COL.OnHand)).toBe("3");
  });

  it("keying an order qty ticks the row, 0 unticks it; a bad number is refused", () => {
    let rows = rowsFromSuggestions([suggestion({ suggestedQty: "0" })]);
    expect(rows[0].ticked).toBe(false);
    rows = editOrderQty(rows, "r1", "5");
    expect(rows[0]).toMatchObject({ orderQty: "5", ticked: true });
    rows = editOrderQty(rows, "r1", "0");
    expect(rows[0].ticked).toBe(false);
    expect(editOrderQty(rows, "r1", "1.2345")[0].orderQty).toBe("0");
    expect(editRate(rows, "r1", "13.25")[0].rate).toBe("13.25");
    expect(editRate(rows, "r1", "abc")[0].rate).toBe("12.50");
  });

  it("Tick all ticks every row when any is off, else unticks them all", () => {
    let rows = rowsFromSuggestions([suggestion({}), suggestion({ reorderId: "r2", below: false })]);
    expect(tickAllLabel(rows)).toBe("Tick all");
    rows = tickAll(rows);
    expect(rows.every((row) => row.ticked)).toBe(true);
    expect(tickAllLabel(rows)).toBe("Untick all");
    rows = tickAll(rows);
    expect(rows.some((row) => row.ticked)).toBe(false);
    expect(toggleTick(rows, "r2")[1].ticked).toBe(true);
  });

  it("a supplier set for the ticked rows reads 'set'; the summary counts POs by supplier", () => {
    let rows = rowsFromSuggestions([
      suggestion({}),
      suggestion({ reorderId: "r2", supplierId: null, supplierName: null, suggestedQty: "10", rate: "2" }),
      suggestion({ reorderId: "r3", supplierId: "s2", supplierName: "AB", suggestedQty: "1", rate: null }),
    ]);
    rows = toggleTick(rows, "r2");
    expect(summarize(rows)).toEqual({ ticked: 3, pos: 2, value: 24 * 12.5 + 10 * 2, withoutSupplier: 1 });
    expect(createProblems(rows)).toEqual(["SOAP: no supplier"]);
    rows = toggleTick(toggleTick(rows, "r1"), "r3");
    const { rows: set, count } = setSupplierForTicked(rows, "s9", "NEW");
    expect(count).toBe(1);
    expect(set[1]).toMatchObject({ supplierId: "s9", supplierName: "NEW", source: "set" });
    expect(set[0].supplierId).toBe("s1");
  });

  it("the create body sends the ticked rows, a rate only when keyed", () => {
    let rows = rowsFromSuggestions([
      suggestion({}),
      suggestion({ reorderId: "r2", itemId: "i2", supplierId: "s2", rate: null, suggestedQty: "3" }),
      suggestion({ reorderId: "r3", itemId: "i3", below: false }),
    ]);
    expect(createBody(rows, SCOPE)).toEqual({
      ...SCOPE,
      rows: [
        { itemId: "i1", uomId: "u1", qty: 24, supplierId: "s1", rate: 12.5 },
        { itemId: "i2", uomId: "u1", qty: 3, supplierId: "s2" },
      ],
    });
    rows = rows.map((row) => ({ ...row, ticked: false }));
    expect(createBody(rows, SCOPE)).toBeNull();
    expect(createProblems(editOrderQty(rows, "r1", "")).length).toBe(0);
  });
});

describe("reorder → PO — columns", () => {
  it("the tick column always shows; hidden carriers never draw; widths sum to 100", () => {
    const columns = resolveReorderColumns([
      { uiTblClmNo: 0, uiTblClmName: "✓", uiTblClmColumnWidth: 3, uiTblClmColumnVisibility: false },
      { uiTblClmNo: 3, uiTblClmName: "Godown", uiTblClmColumnWidth: 9, uiTblClmColumnVisibility: false },
      { uiTblClmNo: 13, uiTblClmName: "ItemId", uiTblClmColumnWidth: 5, uiTblClmColumnVisibility: true },
    ] as never);
    const numbers = columns.map((column) => column.no);
    expect(numbers).toContain(COL.Tick);
    expect(numbers).not.toContain(COL.Godown);
    expect(numbers).not.toContain(13);
    expect(Math.round(columns.reduce((sum, column) => sum + column.widthPct, 0))).toBe(100);
  });
});
