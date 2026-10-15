import { afterEach, describe, expect, it } from "vitest";
import { closeDialog, isTopDialog, openDialog, openDialogCount, resetDialogsForTests } from "./dialog-stack";
import { settlementErrorCode, settlementErrorDetails, settlementErrorMessage, settlementErrorStatus } from "./errors";
import { FALLBACK_COLUMNS, cellText, columnTotals, mergeColumns } from "./grid-columns";
import { screenAction, type KeyInput } from "./keys";
import { settlementTenders, tenderLabel } from "./tenders";

describe("errors", () => {
  /** What the module's filter answers: flat, a code on each detail. */
  const fileInvalid = {
    status: 422,
    data: {
      success: false,
      message: "2 row(s) of the file cannot be read",
      errors: [
        { field: "file", message: 'Line 3: gross "x" is not an amount', code: "SETTLEMENT_FILE_INVALID", lineNo: 3 },
        { field: "file", message: "Line 7: net 10 ≠ gross 12.00 − fee 1.00 − tax 0.00", code: "SETTLEMENT_FILE_INVALID", lineNo: 7 },
      ],
    },
  };

  it("reads the code, every row and the envelope over them", () => {
    expect(settlementErrorCode(fileInvalid)).toBe("SETTLEMENT_FILE_INVALID");
    expect(settlementErrorStatus(fileInvalid)).toBe(422);
    expect(settlementErrorDetails(fileInvalid)).toHaveLength(2);
    expect(settlementErrorMessage(fileInvalid)).toBe(
      '2 row(s) of the file cannot be read\nLine 3: gross "x" is not an amount\nLine 7: net 10 ≠ gross 12.00 − fee 1.00 − tax 0.00',
    );
  });

  it("shows one detail as itself, and a validation failure by its fields", () => {
    const approval = {
      status: 403,
      data: {
        success: false,
        message: "Only an approver may write off a card / UPI amount: …",
        errors: [{ field: "userId", message: "Only an approver may write off …", code: "NONCASH_WRITE_OFF_NEEDS_APPROVAL", event: "NONCASH_WRITE_OFF" }],
      },
    };
    expect(settlementErrorCode(approval)).toBe("NONCASH_WRITE_OFF_NEEDS_APPROVAL");
    expect(settlementErrorMessage(approval)).toBe("Only an approver may write off …");
    const validation = {
      status: 400,
      data: { success: false, message: "Validation failed", errors: [{ field: "x", message: "property x should not exist" }, { field: "y", message: "y must be a UUID" }] },
    };
    expect(settlementErrorMessage(validation)).toBe("property x should not exist\ny must be a UUID");
  });

  it("reads the global filter's nested shape and a network failure", () => {
    const nested = {
      status: 400,
      data: { statusCode: 400, message: { message: "Grid 138 configured SQL failed", errors: [{ field: "grid", code: "GRID_SQL" }] } },
    };
    expect(settlementErrorCode(nested)).toBe("GRID_SQL");
    expect(settlementErrorMessage(nested)).toBe("Grid 138 configured SQL failed");
    expect(settlementErrorMessage({ status: undefined, message: "Failed to fetch" })).toBe("Failed to fetch");
    expect(settlementErrorMessage(new Error("The server answered without the payout."))).toBe(
      "The server answered without the payout.",
    );
    expect(settlementErrorMessage(null)).toBe("The request failed.");
    expect(settlementErrorCode(null)).toBe("");
  });
});

describe("tenders", () => {
  const rows = [
    { tndId: "t-upi", tndCompanyId: "co-1", tndTypeName: "UPI", tndName: "UPI", tndTerminalId: "DASd", tndUpiVpa: "Vktech@kvb.in", tndSettlementLedgerId: "led", tndDisplayPosition: 3, tndIsDeleted: false },
    { tndId: "t-cash", tndCompanyId: "co-1", tndTypeName: "CASH", tndName: "CASH", tndDisplayPosition: 1 },
    { tndId: "t-card", tndCompanyId: "co-1", tndTypeId: "2", tndTypeName: null, tndName: "CARD", tndSettlementLedgerId: null, tndDisplayPosition: 2 },
    { tndId: "t-other", tndCompanyId: "co-2", tndTypeName: "CARD", tndName: "Other co" },
    { tndId: "t-gone", tndCompanyId: "co-1", tndTypeName: "WALLET", tndName: "Gone", tndIsDeleted: true },
  ];

  it("keeps this company's card / UPI / wallet / bank tenders, in display order", () => {
    const tenders = settlementTenders(rows, "co-1");
    expect(tenders.map((t) => t.id)).toEqual(["t-card", "t-upi"]);
    expect(tenders[0]).toMatchObject({ typeName: "CARD", settlementLedgerId: "" });
  });

  it("labels a tender with its terminal and VPA", () => {
    expect(tenderLabel(settlementTenders(rows, "co-1")[1])).toBe("UPI  · TID DASd  · Vktech@kvb.in");
    expect(tenderLabel(settlementTenders(rows, "co-1")[0])).toBe("CARD");
  });
});

describe("dialog stack", () => {
  afterEach(resetDialogsForTests);

  it("lets only the top dialog take Escape", () => {
    openDialog("format");
    openDialog("confirm");
    expect(isTopDialog("confirm")).toBe(true);
    expect(isTopDialog("format")).toBe(false);
    closeDialog("confirm");
    expect(isTopDialog("format")).toBe(true);
    expect(openDialogCount()).toBe(1);
    closeDialog("format");
    expect(isTopDialog("format")).toBe(false);
    expect(openDialogCount()).toBe(0);
  });

  it("moves a re-opened dialog to the top", () => {
    openDialog("a");
    openDialog("b");
    openDialog("a");
    expect(isTopDialog("a")).toBe(true);
    expect(openDialogCount()).toBe(2);
  });
});

describe("configured columns", () => {
  it("falls back to the specs' visible columns", () => {
    const columns = mergeColumns(FALLBACK_COLUMNS.payouts, []);
    expect(columns.map((c) => c.field)).not.toContain("asi_file_name");
    expect(columns[0]).toMatchObject({ field: "asi_payout_date", format: "date", align: "center" });
  });

  it("follows Grid Master's order, headings and visibility, formatting by the specs", () => {
    const columns = mergeColumns(FALLBACK_COLUMNS.payouts, [
      { field: "asi_total_net", header: "Net to bank", visible: true, order: 2 },
      { field: "asi_payout_date", header: "Payout Date", visible: true, order: 1 },
      { field: "asi_provider", header: "Provider", visible: false, order: 3 },
      { field: "new_amount", header: "New", visible: true, order: 4 },
    ]);
    expect(columns.map((c) => c.field)).toEqual(["asi_payout_date", "asi_total_net", "new_amount"]);
    expect(columns[1]).toMatchObject({ header: "Net to bank", format: "money", total: true, align: "right" });
    expect(columns[2]).toMatchObject({ format: "money", total: false });
  });

  it("formats cells and totals the money columns that total", () => {
    const columns = mergeColumns(FALLBACK_COLUMNS.unexplained, []);
    const row = {
      asi_payout_date: "2026-10-08",
      asl_txn_on: "2026-10-07T15:12:00+05:30",
      asl_gross_amount: "1200.00",
      age_days: 2,
    };
    const byField = Object.fromEntries(columns.map((c) => [c.field, c]));
    expect(cellText(row, byField.asi_payout_date)).toBe("08-10-2026");
    expect(cellText(row, byField.asl_txn_on)).toBe("07-10-2026 03:12 PM");
    expect(cellText(row, byField.asl_gross_amount)).toBe("1,200.00");
    expect(cellText(row, byField.age_days)).toBe("2");
    expect(columnTotals([row, { ...row, asl_gross_amount: "500.00" }], columns)).toEqual({ asl_gross_amount: 170000 });
  });
});

describe("keys", () => {
  const key = (k: string, mods: Partial<KeyInput> = {}): KeyInput => ({
    key: k,
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    shiftKey: false,
    ...mods,
  });

  it("binds Qt's shortcuts to their tabs", () => {
    expect(screenAction(key("F5"), { tab: "suspense", inLinesTable: false })).toBe("refresh");
    expect(screenAction(key("m", { ctrlKey: true }), { tab: "match", inLinesTable: false })).toBe("runMatch");
    expect(screenAction(key("P", { ctrlKey: true }), { tab: "match", inLinesTable: false })).toBe("post");
    expect(screenAction(key("p", { ctrlKey: true }), { tab: "notReceived", inLinesTable: false })).toBeNull();
    expect(screenAction(key("w", { ctrlKey: true }), { tab: "notReceived", inLinesTable: false })).toBe("writeOff");
    expect(screenAction(key("r", { ctrlKey: true }), { tab: "unexplained", inLinesTable: false })).toBe("resolve");
    expect(screenAction(key("r", { ctrlKey: true }), { tab: "match", inLinesTable: false })).toBeNull();
  });

  it("takes Enter and Del only inside the lines table", () => {
    expect(screenAction(key("Enter"), { tab: "match", inLinesTable: true })).toBe("confirm");
    expect(screenAction(key("Delete"), { tab: "match", inLinesTable: true })).toBe("unlink");
    expect(screenAction(key("Enter"), { tab: "match", inLinesTable: false })).toBeNull();
    expect(screenAction(key("Enter", { altKey: true }), { tab: "match", inLinesTable: true })).toBeNull();
  });
});
