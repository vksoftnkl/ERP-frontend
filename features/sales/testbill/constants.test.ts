/**
 * Sale Bill Entry — the grid 22 column map.
 *
 * `ui_table_columns` stores a display NAME and no field token, so the meaning of
 * every cell is hard-coded client-side and the join is by name. That makes this
 * map the single point where a layout change silently mislabels the grid: a
 * missing entry drops a column, and an entry in the wrong PLACE shifts every
 * column after it — a Rate cell painting a discount, on the document that takes
 * the money.
 *
 * These tests are the guard rail. They assert the map against the live layout of
 * `fixed.ui_tables` id 22 as seeded in `prisma/seed/Ui_Table_Columns.sql`.
 */
import { describe, expect, it } from "vitest";
import { UI_TABLES } from "@/lib/ui-tables";
import { normalizeColumnToken } from "@/features/sales/quotation/quotation.constants";
import type { UiTableColumnRow } from "@/features/sales/quotation/quotation.types";
import { resolveItemColumnsWith } from "@/features/sales/quotation/quotation.utils";
import { SALES_ITEM_COLUMN_MEANINGS } from "@/features/sales/sale-order/sale-order.constants";
import {
  SALE_BILL_INJECTED_ITEM_COLUMNS,
  SALE_BILL_ITEM_COLUMN_COUNT,
  SALE_BILL_ITEM_COLUMN_MEANINGS,
  SALE_BILL_ITEM_COLUMN_NUMBERS,
  SALE_BILL_ITEM_COLUMN_WIDTH_UNIT,
  SALE_BILL_ITEM_GRID_UI_TABLE_KEY,
  SALE_BILL_SIZE_COLUMN_MEANING,
} from "@/features/sales/testbill/constants";

/**
 * `ui_tbl_clm_name` for table 22, columns 0..93, verbatim from the seed and in
 * `ui_tbl_clm_no` order. Written out rather than derived, because the whole
 * point is to notice when the map and the database disagree.
 */
const TABLE_22_COLUMN_NAMES = [
  "Id", "Barcode", "Code", "Description", "AliasName", "Hsn", "BatchNo", "ExpiryDate",
  "GodownName", "StockQty", "Uom", "ToBaseFactor", "OrderQty", "Case Qty", "Bill Qty",
  "Length Qty", "NetQty", "Sch", "IsFree", "Weight", "PriceLevel", "Mrp", "Rate", "Rate.BTax",
  "Gross", "DiscPerc", "DiscPerQty", "DiscAmt", "SplDiscPerc", "SplDiscPerQty", "SplDiscAmt",
  "SchemeName", "SchPerc", "SchPerQty", "SchAmt", "BillSchDiscPerc", "BillSchDiscAmt",
  "NetGross", "ChrgBeforeTax", "CashDiscPerc", "CashDiscAmt", "Taxable", "Gst %", "GstAmt",
  "Cgst %", "CgstAmt", "Sgst %", "SgstAmt", "Igst %", "IgstAmt", "Cess %", "CessUom", "CessAmt",
  "HasFreight", "FreightPerQty", "FreightAmt", "CoolyPerQty", "CoolyAmt", "ChrgAfterTax",
  "Total", "NetPrice", "CostPrice", "SavingsPerc", "Remarks", "DecimalCount", "BatchConfig",
  "AllowNegative", "Reorder", "ActualPrice", "MinPrice", "CostBeforeTax", "Profit",
  "ProfitBeforeTax", "LoyaltyPv", "SalesmanName", "ServiceItem", "SrcDocId", "ItemId",
  "GroupId", "BrandId", "SectionId", "CategoryId", "GodownId", "UnitId", "SchemeId",
  "SalesmanId", "IsInclusiveTax", "NetB.Tax", "Diff", "StockId", "BatchDate", "SerialNo",
  "PendingQty", "LineStatus",
];

/** The five columns table 22 ships hidden (`ui_tbl_clm_column_visibility = false`). */
const TABLE_22_HIDDEN = ["Code", "AliasName", "SchemeName", "CashDiscPerc", "CashDiscAmt"];

describe("grid identity", () => {
  it("names the SALE BILL - LINES table and measures its widths in Qt percents", () => {
    // That table is a DESKTOP layout — the Qt client's own — so its widths are
    // percentages of the viewport, not pixels. Reading them as pixels renders a
    // 2.13% column as a 2px one.
    expect(UI_TABLES[SALE_BILL_ITEM_GRID_UI_TABLE_KEY].name).toBe("SALE BILL - LINES");
    expect(SALE_BILL_ITEM_COLUMN_WIDTH_UNIT).toBe("qtPercent");
  });
});

describe("SALE_BILL_ITEM_COLUMN_MEANINGS", () => {
  it("declares exactly the 94 columns the layout carries, in order", () => {
    expect(SALE_BILL_ITEM_COLUMN_MEANINGS).toHaveLength(SALE_BILL_ITEM_COLUMN_COUNT);
    expect(TABLE_22_COLUMN_NAMES).toHaveLength(SALE_BILL_ITEM_COLUMN_COUNT);
    expect(SALE_BILL_ITEM_COLUMN_MEANINGS.map((column) => column.token)).toEqual(
      TABLE_22_COLUMN_NAMES,
    );
  });

  it("leaves 89 of the 94 visible by default", () => {
    // Not asserted on the meanings — visibility is the layout's, not the map's —
    // but stated here because the plan quotes the pair and a future reader will
    // want to know where 89 came from.
    expect(SALE_BILL_ITEM_COLUMN_COUNT - TABLE_22_HIDDEN.length).toBe(89);
  });

  it("gives every column a distinct key", () => {
    const keys = SALE_BILL_ITEM_COLUMN_MEANINGS.map((column) => column.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("normalises each key from its own token", () => {
    for (const column of SALE_BILL_ITEM_COLUMN_MEANINGS) {
      expect(column.key).toBe(normalizeColumnToken(column.token));
    }
  });

  it("numbers the columns by position, with no gaps and no duplicates", () => {
    // Unlike table 24, which reuses 92 and 93, table 22's numbering is a clean
    // 0..93 — which is why the number map may be derived from the list's order.
    const numbers = Object.values(SALE_BILL_ITEM_COLUMN_NUMBERS).sort((a, b) => a - b);
    expect(numbers).toEqual(Array.from({ length: SALE_BILL_ITEM_COLUMN_COUNT }, (_, i) => i));
    for (const [index, column] of SALE_BILL_ITEM_COLUMN_MEANINGS.entries()) {
      expect(SALE_BILL_ITEM_COLUMN_NUMBERS[column.key]).toBe(index);
    }
  });
});

describe("where grid 22 differs from the sale order's grid 24", () => {
  it("shares columns 0–88 with the order, except position 4", () => {
    const bill = SALE_BILL_ITEM_COLUMN_MEANINGS.slice(0, 89).map((column) => column.token);
    const order = SALES_ITEM_COLUMN_MEANINGS.slice(0, 89).map((column) => column.token);
    // Position 4 is the whole difference: AliasName on the bill, Size on the
    // order. Everything else in the sales vocabulary is shared, which is what
    // lets both screens run the same grid components and the same engine.
    expect(bill[4]).toBe("AliasName");
    expect(order[4]).toBe("Size");
    expect(bill.filter((_, index) => index !== 4)).toEqual(
      order.filter((_, index) => index !== 4),
    );
  });

  it("names column 14 'Bill Qty', writing the same billQty the quotation calls 'Quote Qty'", () => {
    const column = SALE_BILL_ITEM_COLUMN_MEANINGS[14];
    expect(column.token).toBe("Bill Qty");
    expect(column.write).toBe("billQty");
  });

  it("ends on the bill's own five: the batch allocation and the source echo", () => {
    expect(SALE_BILL_ITEM_COLUMN_MEANINGS.slice(89).map((column) => column.token)).toEqual([
      "StockId",
      "BatchDate",
      "SerialNo",
      "PendingQty",
      "LineStatus",
    ]);
  });

  it("configures no Size column — the bill's own is injected, never mapped", () => {
    // Table 22 has no Size row, and the meaning must stay OUT of the mapped list
    // even so: `SALE_BILL_ITEM_COLUMN_NUMBERS` is derived from that list's order,
    // so an inserted entry would shift every column number after it — a Rate
    // cell painting a discount, on the document that takes the money.
    const sizeColumns = SALE_BILL_ITEM_COLUMN_MEANINGS.filter(
      (column) => column.kind === "size" || column.write === "itemSize",
    );
    expect(sizeColumns).toHaveLength(0);
    expect(SALE_BILL_ITEM_COLUMN_NUMBERS[SALE_BILL_SIZE_COLUMN_MEANING.key]).toBeUndefined();
  });
});

describe("the injected Size column (§7.4)", () => {
  /** Table 22 as seeded: every column by name, in `ui_tbl_clm_no` order. */
  function table22(): UiTableColumnRow[] {
    return TABLE_22_COLUMN_NAMES.map((name, no) => ({
      uiTblClmId: `c${no}`,
      uiTblClmNo: String(no),
      uiTblClmName: name,
      uiTblClmColumnWidth: 4,
      uiTblClmColumnVisibility: !TABLE_22_HIDDEN.includes(name),
      uiTblClmColumnFocus: false,
      uiTblClmColumnPosition: no,
      uiTblClmColumnNecessity: false,
    }));
  }

  function resolve(rows: UiTableColumnRow[]) {
    return resolveItemColumnsWith(
      rows,
      SALE_BILL_ITEM_COLUMN_MEANINGS,
      SALE_BILL_ITEM_COLUMN_WIDTH_UNIT,
      SALE_BILL_ITEM_COLUMN_NUMBERS,
      SALE_BILL_INJECTED_ITEM_COLUMNS,
    );
  }

  it("writes itemSize and reads it back, like grids 23 and 24 do", () => {
    expect(SALE_BILL_SIZE_COLUMN_MEANING.kind).toBe("size");
    expect(SALE_BILL_SIZE_COLUMN_MEANING.write).toBe("itemSize");
    expect(SALE_BILL_SIZE_COLUMN_MEANING.read).toBe("itemSize");
  });

  it("lands straight after Description, visible and in the Enter chain", () => {
    const columns = resolve(table22());
    const keys = columns.map((column) => column.key);
    expect(keys.indexOf("size")).toBe(keys.indexOf("description") + 1);
    const size = columns[keys.indexOf("size")];
    expect(size.visible).toBe(true);
    // No `ui_tbl_clm_id`, so a width drag and a reorder both stay local instead
    // of saving against a row the layout does not have.
    expect(size.columnId).toBeNull();
  });

  it("stays OUT of the Enter chain while table 22 flags no column for it", () => {
    // Table 22 flags none, which `grid-focus.ts` reads as "stop at every
    // editable cell" — Size included. Flagging the injected column would make
    // it the only flagged one and collapse the whole chain onto it.
    const columns = resolve(table22());
    expect(columns.some((column) => column.focus)).toBe(false);
  });

  it("joins the Enter chain on a layout that has one", () => {
    // The day table 22 flags its own stops — the way grid 23 flags Description,
    // Size, Quote Qty and Rate — the cell that drives Bill Qty has to be one.
    const rows = table22().map((row) =>
      row.uiTblClmName === "Bill Qty" ? { ...row, uiTblClmColumnFocus: true } : row,
    );
    const size = resolve(rows).find((column) => column.key === "size");
    expect(size?.focus).toBe(true);
  });

  it("leaves the 94 configured columns alone", () => {
    const columns = resolve(table22());
    expect(columns).toHaveLength(SALE_BILL_ITEM_COLUMN_COUNT + 1);
    expect(
      columns.filter((column) => column.key !== "size").map((column) => column.header),
    ).toEqual(TABLE_22_COLUMN_NAMES);
  });

  it("steps aside for a seeded row, under either name", () => {
    // The day table 22 is given a Size column of its own, the configured row
    // wins — its width, its visibility, its id — and nothing is injected on top.
    for (const name of ["Size", "ItemSize"]) {
      const rows = table22();
      rows.push({
        uiTblClmId: "c94",
        uiTblClmNo: "94",
        uiTblClmName: name,
        uiTblClmColumnWidth: 6,
        uiTblClmColumnVisibility: true,
        uiTblClmColumnFocus: true,
        uiTblClmColumnPosition: 94,
        uiTblClmColumnNecessity: false,
      });
      const columns = resolve(rows);
      const size = columns.filter((column) => column.key === "size");
      expect(size).toHaveLength(1);
      expect(size[0].columnId).toBe("c94");
    }
  });
});

describe("the two rules the bill adds to the grid", () => {
  it("leaves AllowNegative read-only, so the gate cannot be keyed per line", () => {
    // The Qt screen writes this flag by hand on three different paths and gets
    // three different behaviours out of one rule (§7.2). The flag belongs to the
    // ITEM and arrives through the price lookup; a cell nobody can type into is
    // the cheapest way not to inherit the incoherence.
    const column = SALE_BILL_ITEM_COLUMN_MEANINGS.find((c) => c.key === "allownegative");
    expect(column?.read).toBe("allowNegative");
    expect(column?.write).toBeUndefined();
  });

  it("keeps PendingQty and LineStatus display-only", () => {
    // They are the SOURCE order line's state, echoed. The bill reports them and
    // must never write them, or the order and the bill start disagreeing about
    // what is still open.
    for (const key of ["pendingqty", "linestatus"]) {
      const column = SALE_BILL_ITEM_COLUMN_MEANINGS.find((c) => c.key === key);
      expect(column).toBeDefined();
      expect(column?.write).toBeUndefined();
    }
  });
});
