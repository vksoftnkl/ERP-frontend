import { describe, expect, it } from "vitest";
import type { UiTableColumnRow } from "@/features/sales/quotation/quotation.types";
import {
  BILL_COLUMN_MEANINGS,
  BILL_FROZEN_COLUMNS,
  LEDGER_COLUMN_MEANINGS,
  resolveBillColumns,
  resolveLedgerColumns,
} from "./columns";

function column(partial: Partial<UiTableColumnRow>): UiTableColumnRow {
  return {
    uiTblClmId: "1",
    uiTblClmNo: "0",
    uiTblClmName: "Ledger",
    uiTblClmColumnWidth: 20.44,
    uiTblClmPx: null,
    uiTblClmColumnVisibility: true,
    uiTblClmColumnFocus: false,
    uiTblClmColumnPosition: 0,
    uiTblClmColumnNecessity: false,
    ...partial,
  };
}

describe("the grid FOLLOWS the layout", () => {
  it("orders by position, with the column number as the tie-break", () => {
    const resolved = resolveLedgerColumns([
      column({ uiTblClmNo: "6", uiTblClmName: "Opening", uiTblClmColumnPosition: 1 }),
      column({ uiTblClmNo: "0", uiTblClmName: "Ledger", uiTblClmColumnPosition: 0 }),
      column({ uiTblClmNo: "1", uiTblClmName: "Group", uiTblClmColumnPosition: 0 }),
    ]);
    expect(resolved.map((entry) => entry.key)).toEqual(["ledger", "group", "opening"]);
  });

  it("hides what the layout hides, rather than deciding for itself", () => {
    const resolved = resolveLedgerColumns([
      column({ uiTblClmNo: "0", uiTblClmName: "Ledger" }),
      column({
        uiTblClmNo: "11",
        uiTblClmName: "Remarks",
        uiTblClmColumnPosition: 1,
        uiTblClmColumnVisibility: false,
      }),
    ]);
    // Present in the resolved list, but not visible — the grid renders only the
    // visible ones, and nothing here asserts which those are on a real server.
    expect(resolved).toHaveLength(2);
    expect(resolved.find((entry) => entry.key === "remarks")?.visible).toBe(false);
  });

  it("carries the layout's own heading, whatever it renamed the column to", () => {
    const resolved = resolveLedgerColumns([
      column({ uiTblClmNo: "4", uiTblClmName: "B/F closing" }),
    ]);
    // Matched by ui_tbl_clm_no once the name join misses, then painted as named.
    expect(resolved[0].key).toBe("priorclosing");
    expect(resolved[0].header).toBe("B/F closing");
  });

  it("converts the Qt fraction to pixels — it is NOT a percent", () => {
    // As a CSS `%` under `table-layout: fixed` this feeds back into its own
    // container and blows the table up to millions of pixels.
    const resolved = resolveLedgerColumns([column({ uiTblClmColumnWidth: 20.44 })]);
    expect(resolved[0].widthPx).toBe(225);
    expect(resolved[0].widthPx).toBeLessThan(1000);
  });

  it("prefers a dragged pixel width where one exists", () => {
    const resolved = resolveLedgerColumns([
      column({ uiTblClmColumnWidth: 20.44, uiTblClmPx: "140px" }),
    ]);
    expect(resolved[0].widthPx).toBe(140);
  });

  it("drops a configured column this screen has no meaning for", () => {
    const resolved = resolveLedgerColumns([
      column({ uiTblClmNo: "0", uiTblClmName: "Ledger" }),
      // The three hidden Qt id columns — a React row carries those as fields.
      column({ uiTblClmNo: "12", uiTblClmName: "OpId", uiTblClmColumnPosition: 1 }),
      column({ uiTblClmNo: "14", uiTblClmName: "IsBillWise", uiTblClmColumnPosition: 2 }),
    ]);
    expect(resolved.map((entry) => entry.key)).toEqual(["ledger"]);
  });

  it("falls back to every meaning when the layout could not be fetched", () => {
    expect(resolveLedgerColumns(undefined)).toHaveLength(LEDGER_COLUMN_MEANINGS.length);
    expect(resolveBillColumns([])).toHaveLength(BILL_COLUMN_MEANINGS.length);
  });

  it("carries the layout's Enter-chain flag through", () => {
    const resolved = resolveLedgerColumns([
      column({ uiTblClmNo: "0", uiTblClmName: "Ledger", uiTblClmColumnFocus: true }),
      column({
        uiTblClmNo: "1",
        uiTblClmName: "Group",
        uiTblClmColumnPosition: 1,
        uiTblClmColumnFocus: false,
      }),
    ]);
    expect(resolved[0].focus).toBe(true);
    expect(resolved[1].focus).toBe(false);
  });
});

describe("a receipted bill", () => {
  it("fixes its reference, DATE, amount and side — and nothing else", () => {
    // The route's description says a receipted bill takes "date, credit-day and
    // narration changes", but the service compares ablDocDate alongside amount,
    // side and refno and refuses a change to it. Grace days it writes, so those
    // stay open. Frozen here follows the CODE, not the description.
    expect([...BILL_FROZEN_COLUMNS].sort()).toEqual(
      ["amount", "drcr", "invoicedate", "invoiceno"].sort(),
    );
    expect(BILL_FROZEN_COLUMNS.has("grace")).toBe(false);
    expect(BILL_FROZEN_COLUMNS.has("duedate")).toBe(false);
    expect(BILL_FROZEN_COLUMNS.has("creditdays")).toBe(false);
    expect(BILL_FROZEN_COLUMNS.has("narration")).toBe(false);
  });
});
