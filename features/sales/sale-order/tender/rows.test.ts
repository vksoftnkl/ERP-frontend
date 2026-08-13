/**
 * Sale Tender — master → row translation (the plan's §3 and §15).
 */
import { describe, expect, it } from "vitest";
import type { TenderMasterRow } from "../sale-order.types";
import {
  fallbackReasonMessage,
  fallbackTenderRows,
  hotkeyFor,
  rowIsUsable,
  tenderRowFromMaster,
  usableTenders,
} from "./rows";

function master(overrides: Partial<TenderMasterRow> = {}): TenderMasterRow {
  return {
    tndId: "tnd-1",
    tndCompanyId: "company-1",
    tndBranchId: null,
    tndTypeId: "1",
    tndName: "CASH",
    tndShortName: "CASH",
    tndLedgerId: "led-cash",
    tndSettlementLedgerId: null,
    tndTypeName: "CASH",
    tndLedgerName: null,
    tndSurchargeLedgerName: null,
    tndSettlementDays: 0,
    tndMinAmount: 0,
    tndMaxAmount: null,
    tndDailyLimit: null,
    tndSurchargePerc: 0,
    tndSurchargeAmount: 0,
    tndSurchargeLedgerId: null,
    tndEditSurcharge: false,
    tndEditLedger: false,
    tndConversionRate: 1,
    tndNeedsRef: null,
    tndAllowChange: null,
    tndAllowInReturn: null,
    tndOpenCashDrawer: false,
    tndIsDefault: false,
    tndDisplayPosition: 10,
    tndHotkey: null,
    tndColour: null,
    tndEffectiveFrom: null,
    tndEffectiveTo: null,
    tndIsActive: true,
    tndIsDeleted: false,
    ...overrides,
  };
}

describe("the three nullable behaviour flags", () => {
  it("null INHERITS the type default — the classic cash-change bug", () => {
    // `Boolean(master.tndAllowChange)` on a NULL would make cash stop giving
    // change; the type says CASH gives change, and null means "inherit".
    const cash = tenderRowFromMaster(master({ tndAllowChange: null }));
    expect(cash.allowChange).toBe(true);

    const card = tenderRowFromMaster(
      master({ tndTypeId: "2", tndName: "CARD", tndNeedsRef: null }),
    );
    expect(card.needsRef).toBe(true); // CARD's type default
    expect(card.allowChange).toBe(false);
  });

  it("a stated override wins over the type default", () => {
    const card = tenderRowFromMaster(
      master({ tndTypeId: "2", tndName: "CARD", tndNeedsRef: false }),
    );
    expect(card.needsRef).toBe(false);
  });

  it("CASH gives change even when the master explicitly says no", () => {
    const cash = tenderRowFromMaster(master({ tndAllowChange: false }));
    expect(cash.allowChange).toBe(true);
  });
});

describe("offerable rows", () => {
  const documentDate = "2026-08-11";

  it("drops inactive and deleted rows", () => {
    const rows = usableTenders(
      [
        master({ tndId: "a" }),
        master({ tndId: "b", tndIsActive: false }),
        master({ tndId: "c", tndIsDeleted: true }),
      ],
      documentDate,
      "settlement",
    );
    expect(rows.map((row) => row.tndId)).toEqual(["a"]);
  });

  it("judges the effective window against the DOCUMENT date, not today", () => {
    // A bill dated back into an earlier period must offer the tenders that
    // were live then.
    const retired = master({ tndId: "retired", tndEffectiveTo: "2026-07-31" });
    const future = master({ tndId: "future", tndEffectiveFrom: "2026-09-01" });
    const live = master({ tndId: "live", tndEffectiveFrom: "2026-01-01" });
    expect(
      usableTenders([retired, future, live], documentDate, "settlement").map((r) => r.tndId),
    ).toEqual(["live"]);
    // Back-dated into July: the retired one is exactly the right answer.
    expect(usableTenders([retired, future, live], "2026-07-15", "settlement").map((r) => r.tndId))
      .toEqual(["retired", "live"]);
  });

  it("sorts by display position, name as the stable tie-break", () => {
    const rows = usableTenders(
      [
        master({ tndId: "z", tndName: "ZED", tndDisplayPosition: 5 }),
        master({ tndId: "a", tndName: "ALPHA", tndDisplayPosition: 5 }),
        master({ tndId: "first", tndName: "CASH", tndDisplayPosition: 1 }),
      ],
      documentDate,
      "settlement",
    );
    expect(rows.map((row) => row.tndName)).toEqual(["CASH", "ALPHA", "ZED"]);
  });

  it("an advance never offers RRN, LOYALTY, CREDIT or TEMP_CR", () => {
    const all = [
      master({ tndId: "cash", tndTypeId: "1" }),
      master({ tndId: "rrn", tndTypeId: "7" }),
      master({ tndId: "temp", tndTypeId: "8" }),
      master({ tndId: "credit", tndTypeId: "9" }),
      master({ tndId: "loyalty", tndTypeId: "10" }),
    ];
    expect(usableTenders(all, documentDate, "advance").map((r) => r.tndId)).toEqual(["cash"]);
    expect(usableTenders(all, documentDate, "settlement")).toHaveLength(5);
  });
});

describe("hotkeys", () => {
  it("prefers the master's, falls back to A…L by position", () => {
    expect(hotkeyFor("c", 3)).toBe("C");
    expect(hotkeyFor(null, 0)).toBe("A");
    expect(hotkeyFor("", 2)).toBe("C");
    expect(hotkeyFor(null, 99)).toBeNull();
  });
});

describe("fallback seeding", () => {
  it("seeds cash (and credit when settling) with no master behind it", () => {
    const advance = fallbackTenderRows("advance");
    expect(advance.map((row) => row.typeCode)).toEqual(["CASH"]);
    const settlement = fallbackTenderRows("settlement");
    expect(settlement.map((row) => row.typeCode)).toEqual(["CASH", "CREDIT"]);
    // No tender id: validate refuses to post money against these.
    expect(settlement.every((row) => row.tenderId === "")).toBe(true);
  });

  it("says WHICH fault put the dialog there — three shapes, three sentences", () => {
    expect(fallbackReasonMessage("unavailable", "503")).toContain("Tender master unavailable (503)");
    expect(fallbackReasonMessage("empty")).toContain("No tender is configured");
    expect(fallbackReasonMessage("none-offerable")).toContain("active dates");
  });
});

describe("rowIsUsable — where the cursor may land", () => {
  it("keeps a cash-only customer's CREDIT row keyable but never lands on it", () => {
    const credit = tenderRowFromMaster(master({ tndTypeId: "9", tndName: "CREDIT" }));
    expect(rowIsUsable(credit, false)).toBe(false);
    expect(rowIsUsable(credit, true)).toBe(true);
  });

  it("does not land on a panel-owned row", () => {
    const rrn = tenderRowFromMaster(master({ tndTypeId: "7", tndName: "RRN" }));
    const loyalty = tenderRowFromMaster(master({ tndTypeId: "10", tndName: "LOYALTY" }));
    expect(rowIsUsable(rrn, true)).toBe(false);
    expect(rowIsUsable(loyalty, true)).toBe(false);
  });
});
