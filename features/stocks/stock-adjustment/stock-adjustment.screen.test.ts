/**
 * Stock Adjustment — the settings it obeys, the line grid's columns per kind,
 * and the pick dialog's rows.
 */
import { describe, expect, it } from "vitest";
import type { EffectiveSetting } from "@/features/settings/app-settings/types";
import type { UiTableColumnRow } from "@/features/sales/quotation/quotation.types";
import { resolveLineColumns } from "./stock-adjustment.columns";
import { COL } from "./stock-adjustment.constants";
import { cellNumber, dateFromWire, dateToWire, qtyCell } from "./stock-adjustment.format";
import { damagedPanelRows, damagedPanelTitle, pickDisplayRows, pickNote } from "./stock-adjustment.pick";
import { DEFAULT_STOCK_ADJUSTMENT_SETTINGS, parseStockAdjustmentSettings } from "./stock-adjustment.settings";
import { holding } from "./stock-adjustment.test-fixtures";

function setting(asdKey: string, value: string | null): EffectiveSetting {
  return {
    asdId: asdKey,
    asdKey,
    asdModule: "",
    asdGroup: "",
    asdLabel: "",
    asdDescription: null,
    asdDataType: "TEXT" as EffectiveSetting["asdDataType"],
    asdDefaultValue: null,
    asdAllowedValues: null,
    asdMinValue: null,
    asdMaxValue: null,
    asdMaxScope: "COMPANY" as EffectiveSetting["asdMaxScope"],
    asdSortOrder: 0,
    asdNeedsRelogin: false,
    source: "COMPANY" as EffectiveSetting["source"],
    value,
    override: null,
  };
}

describe("settings", () => {
  it("defaults to list-first and no grace", () => {
    expect(parseStockAdjustmentSettings(undefined)).toEqual(DEFAULT_STOCK_ADJUSTMENT_SETTINGS);
    expect(parseStockAdjustmentSettings([])).toEqual({ txnEntryFirst: false, expiryGraceDays: 0 });
  });

  it("reads system.txn_entry_first and stock.expiry_writeoff_grace_days", () => {
    expect(
      parseStockAdjustmentSettings([
        setting("system.txn_entry_first", "Y"),
        setting("stock.expiry_writeoff_grace_days", "7"),
      ]),
    ).toEqual({ txnEntryFirst: true, expiryGraceDays: 7 });
    expect(parseStockAdjustmentSettings([setting("stock.expiry_writeoff_grace_days", "-3")]).expiryGraceDays).toBe(0);
  });
});

describe("cells", () => {
  it("reads a cell's number the Qt way and writes a quantity without trailing zeros", () => {
    expect(cellNumber("+1,250.5")).toBe(1250.5);
    expect(cellNumber("abc")).toBe(0);
    expect(qtyCell(-3)).toBe("-3");
    expect(qtyCell(2.125)).toBe("2.125");
    expect(qtyCell(0)).toBe("0");
  });

  it("dd-MM-yyyy on screen, ISO on the wire", () => {
    expect(dateToWire("31-03-2027")).toBe("2027-03-31");
    expect(dateToWire("31032027")).toBe("2027-03-31");
    expect(dateToWire("2027-03-31")).toBe("2027-03-31");
    expect(dateToWire("31-02-2027")).toBe("");
    expect(dateFromWire("2027-03-31T00:00:00.000Z")).toBe("31-03-2027");
    expect(dateFromWire("")).toBe("");
  });
});

describe("the line grid's columns", () => {
  const layout: UiTableColumnRow[] = [
    { uiTblClmId: "0", uiTblClmNo: "0", uiTblClmName: "#", uiTblClmColumnWidth: 4, uiTblClmColumnVisibility: true, uiTblClmColumnFocus: false, uiTblClmColumnPosition: 0, uiTblClmColumnNecessity: false },
    { uiTblClmId: "3", uiTblClmNo: "3", uiTblClmName: "Item", uiTblClmColumnWidth: 16, uiTblClmColumnVisibility: true, uiTblClmColumnFocus: true, uiTblClmColumnPosition: 3, uiTblClmColumnNecessity: true },
    { uiTblClmId: "9", uiTblClmNo: "9", uiTblClmName: "Bucket", uiTblClmColumnWidth: 6, uiTblClmColumnVisibility: true, uiTblClmColumnFocus: false, uiTblClmColumnPosition: 9, uiTblClmColumnNecessity: false },
    { uiTblClmId: "10", uiTblClmNo: "10", uiTblClmName: "To bucket", uiTblClmColumnWidth: 6, uiTblClmColumnVisibility: true, uiTblClmColumnFocus: true, uiTblClmColumnPosition: 10, uiTblClmColumnNecessity: false },
    { uiTblClmId: "12", uiTblClmNo: "12", uiTblClmName: "Qty", uiTblClmColumnWidth: 6, uiTblClmColumnVisibility: true, uiTblClmColumnFocus: true, uiTblClmColumnPosition: 13, uiTblClmColumnNecessity: true },
    { uiTblClmId: "20", uiTblClmNo: "20", uiTblClmName: "Dir", uiTblClmColumnWidth: 4, uiTblClmColumnVisibility: true, uiTblClmColumnFocus: false, uiTblClmColumnPosition: 12, uiTblClmColumnNecessity: false },
  ];

  it("shows the kind's columns in the layout's order, with its titles and Enter stops", () => {
    const columns = resolveLineColumns(layout, "Adjustment");
    const numbers = columns.map((column) => column.no);
    expect(numbers.indexOf(COL.Direction)).toBeLessThan(numbers.indexOf(COL.Qty));
    expect(numbers).not.toContain(COL.ToBucket);
    expect(numbers[numbers.length - 1]).toBe(COL.Hint);
    expect(columns.find((column) => column.no === COL.Description)).toMatchObject({ header: "Item", focus: true });
    expect(Math.round(columns.reduce((sum, column) => sum + column.widthPct, 0))).toBe(100);
  });

  it("Move stock reads From → To, with the arrow between them", () => {
    const columns = resolveLineColumns(layout, "Move");
    const numbers = columns.map((column) => column.no);
    expect(numbers.indexOf(COL.Arrow)).toBe(numbers.indexOf(COL.Bucket) + 1);
    expect(numbers.indexOf(COL.ToBucket)).toBe(numbers.indexOf(COL.Arrow) + 1);
    expect(columns.find((column) => column.no === COL.Bucket)?.header).toBe("From");
    expect(columns.find((column) => column.no === COL.ToBucket)?.header).toBe("To");
    expect(numbers).not.toContain(COL.Direction);
  });

  it("falls back to the registered layout when ui_table 41 cannot be read", () => {
    const columns = resolveLineColumns(undefined, "Relot");
    expect(columns.map((column) => column.no)).toEqual([
      COL.LineNo,
      COL.Description,
      COL.BatchNo,
      COL.ExpiryDate,
      COL.Mrp,
      COL.Direction,
      COL.Qty,
      COL.CostRate,
      COL.ReasonName,
      COL.Remarks,
    ]);
  });
});

describe("pick from stock", () => {
  it("groups by supplier, no supplier last, each heading with what is held", () => {
    const rows = [
      holding({ sblId: "1", supplierName: null, availableQty: 1, avgCostRate: 10 }),
      holding({ sblId: "2", supplierName: "Zen", availableQty: 2, avgCostRate: 5 }),
      holding({ sblId: "3", supplierName: "Acme", availableQty: 3, avgCostRate: 2 }),
    ];
    const { display } = pickDisplayRows(rows, { group: true, expiredBy: null, showAll: false });
    expect(display.map((entry) => (entry.type === "group" ? `[${entry.supplier}]` : entry.row.sblId))).toEqual([
      "[Acme]",
      "3",
      "[Zen]",
      "2",
      "[(no supplier on the lot)]",
      "1",
    ]);
    expect(display[0]).toMatchObject({ summary: "3 held · 6.00" });
  });

  it("an expiry write-off offers only lots expired by the cut-off, the rest one tick away, greyed", () => {
    const rows = [
      holding({ sblId: "old", expiryDate: "2026-09-30" }),
      holding({ sblId: "new", expiryDate: "2027-01-01" }),
      holding({ sblId: "none", expiryDate: null }),
    ];
    const hidden = pickDisplayRows(rows, { group: false, expiredBy: "2026-10-02", showAll: false });
    expect(hidden.display.map((entry) => (entry.type === "row" ? entry.row.sblId : ""))).toEqual(["old"]);
    expect(hidden.hidden).toBe(2);
    expect(pickNote(rows, { itemScoped: true, hidden: hidden.hidden, expiredBy: "2026-10-02" }).text).toContain(
      "2 lot(s) not expired by 02-10-2026 are hidden — an unexpired lot is a damage write-off, not an expiry.",
    );
    const all = pickDisplayRows(rows, { group: false, expiredBy: "2026-10-02", showAll: true });
    expect(all.display.filter((entry) => entry.type === "row" && entry.grey)).toHaveLength(2);
  });

  it("says when nothing is there", () => {
    expect(pickNote([], { itemScoped: true, hidden: 0, expiredBy: null }).text).toBe(
      "Nothing available in this godown for this item.",
    );
  });

  it("panel 12: by supplier, and a title that says what is held where", () => {
    const rows = [holding({ sblId: "1", supplierName: null }), holding({ sblId: "2", supplierName: "Acme" })];
    expect(damagedPanelRows(rows).map((row) => row.sblId)).toEqual(["2", "1"]);
    expect(damagedPanelTitle(2, "Main", true)).toBe(
      "DAMAGED STOCK — what goes back to which supplier (2 held in Main, grouped by the lot's supplier)",
    );
    expect(damagedPanelTitle(0, "Main", true)).toBe("DAMAGED STOCK — nothing is held for return in Main");
    expect(damagedPanelTitle(0, "", false)).toBe("DAMAGED STOCK — choose the godown to see what is held for return");
  });
});
