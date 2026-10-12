import { describe, expect, it } from "vitest";
import {
  checkDetailFixture,
  dailyFixture,
  exportFixture,
  GROUP_DEBTORS,
  groupLedgersFixture,
  GROUPS,
  summaryFixture,
  vouchersFixture,
  voucherTypesFixture,
} from "../testing/fixtures";
import {
  DaySummaryParseError,
  parseCheckDetail,
  parseDaily,
  parseExport,
  parseGroupLedgers,
  parseSummary,
  parseVouchers,
  parseVoucherTypes,
} from "./parse";

describe("parse", () => {
  it("reads the whole summary snapshot", () => {
    const s = parseSummary(summaryFixture({ branchId: "x" }));
    expect(s.scope.branchName).toBe("Main Store");
    expect(s.businessDay).toEqual({ status: "OPEN", zNo: null, sessions: { total: 3, closed: 2 } });
    expect(s.types).toHaveLength(7);
    expect(s.typeTotals.amount).toBe("495270.00");
    expect(s.moneyTotals.ALL.closing).toEqual({ amount: "492270.00", side: "DR" });
    expect(s.groupTotals).toEqual({ debit: "495270.00", credit: "495270.00", net: null });
    expect(s.tiles.map((t) => t.code)).toEqual(["SALES", "SALE_RETURNS", "RECEIPTS", "PAYMENTS", "EXPENSES", "CASH_IN_HAND"]);
  });

  it("a range has no business-day status", () => {
    expect(parseSummary(summaryFixture({ fromDate: "2026-10-07", toDate: "2026-10-09" })).businessDay).toBeNull();
  });

  it("fails loudly on a missing amount — never a silent 0.00", () => {
    const raw = summaryFixture();
    delete (raw.data.typeTotals as Record<string, unknown>).amount;
    expect(() => parseSummary(raw)).toThrow(DaySummaryParseError);
    expect(() => parseSummary(raw)).toThrow("summary: $.typeTotals.amount is not an amount string (got undefined)");
  });

  it("refuses a number where an amount string belongs", () => {
    const raw = summaryFixture();
    (raw.data.types[0] as Record<string, unknown>).amount = 186420;
    expect(() => parseSummary(raw)).toThrow("$.types[0].amount is not an amount string (got 186420)");
  });

  it("keeps unknown tile codes, check codes and natures", () => {
    const raw = summaryFixture(
      {},
      {
        tiles: [{ code: "PURCHASES", amount: "1.00", vouchers: 1 }],
        checks: [{ code: "STOCK_NEGATIVE", level: "WARN", facts: { count: 1 } }],
      },
    );
    (raw.data.types[0] as Record<string, unknown>).nature = "TILL_MOVEMENT";
    const s = parseSummary(raw);
    expect(s.tiles[0].code).toBe("PURCHASES");
    expect(s.checks[0]).toEqual({ code: "STOCK_NEGATIVE", level: "WARN", facts: { count: 1 } });
    expect(s.types[0].nature).toBe("TILL_MOVEMENT");
  });

  it("refuses an unknown check level, row kind or money kind (the screen branches on them)", () => {
    expect(() => parseSummary(summaryFixture({}, { checks: [{ code: "X", level: "MAYBE", facts: {} }] }))).toThrow(
      "$.checks[0].level is not one of FAIL, WARN, INFO, OK",
    );
    const raw = vouchersFixture({ pageSize: "5" });
    (raw.data.rows[0] as Record<string, unknown>).rowKind = "VOID";
    expect(() => parseVouchers(raw)).toThrow("$.rows[0].rowKind");
  });

  it("reads voucher pages, with legs when asked, and draft rows", () => {
    const page = parseVouchers(vouchersFixture({ pageSize: "200", withLegs: "true" }));
    expect(page.page).toEqual({ page: 1, pageSize: 200, totalRows: 65 });
    expect(page.totals).toEqual({ amount: "495270.00", cancelledPairs: null });
    expect(page.rows[0].branchId).not.toBeNull();
    expect(page.rows[0].legs).toHaveLength(2);
    const pair = page.rows.filter((r) => r.pairInRange).map((r) => [r.voucherNo, r.rowKind]);
    expect(pair).toEqual([
      ["bil01431", "CANCELLED"],
      ["bil01432", "REVERSAL"],
    ]);
    // The payload's own `draftsOnly` flag picks the row shape.
    const drafts = parseVouchers(vouchersFixture({ draftsOnly: "true" }));
    expect(drafts.rows.map((r) => [r.draft, r.voucherNo, r.short, r.amount, r.legs])).toEqual([
      [true, null, "Pmt", "15000.00", null],
      [true, null, "ExpV", "640.00", null],
    ]);
  });

  it("reads the day-wise rows and the range's opening", () => {
    const d = parseDaily(dailyFixture({ fromDate: "2026-10-07", toDate: "2026-10-09" }));
    expect(d.rows.map((r) => r.date)).toEqual(["2026-10-07", "2026-10-08", "2026-10-09"]);
    expect(d.cashOpening).toEqual({ amount: "30000.00", side: "DR" });
    expect(d.totals).toBeNull();
  });

  it("reads null balances under a voucher-type filter, a numeric zNo and a null short", () => {
    const raw = summaryFixture({ voucherTypeId: "3", branchId: "b" });
    (raw.data.businessDay as Record<string, unknown>) = { status: "CLOSED", zNo: 42, sessions: { total: 1, closed: 1 } };
    (raw.data.types[0] as Record<string, unknown>).short = null;
    const s = parseSummary(raw);
    expect(s.moneyLedgers[0].opening).toBeNull();
    expect(s.moneyTotals.ALL.closing).toBeNull();
    expect(s.tiles[5]).toMatchObject({ opening: null, closing: null, net: { amount: "21600.00", side: "DR" } });
    expect(s.businessDay?.zNo).toBe("42");
    expect(s.types[0].short).toBe("Bil");
    expect(s.checks.some((c) => c.code === "CLEARING_PENDING")).toBe(false);
  });

  it("reads group ledgers with totals, and the bare list without", () => {
    const withTotals = parseGroupLedgers(groupLedgersFixture({ groupId: GROUP_DEBTORS }));
    expect(withTotals.rows).toHaveLength(3);
    expect(withTotals.totals).toEqual({ debit: "22500.00", credit: "61750.00", net: null });
    expect(parseGroupLedgers(groupLedgersFixture({ groupId: GROUPS[0].groupId })).rows).toHaveLength(1);
    // The backend plan's bare list still parses, with no total row.
    const bare = parseGroupLedgers({ success: true, data: [{ ledgerId: "l", ledgerName: "X", groupName: null, debit: "1.00", credit: "0.00", net: { amount: "1.00", side: "DR" } }] });
    expect(bare.rows).toHaveLength(1);
    expect(bare.totals).toBeNull();
  });

  it("reads check detail rows generically", () => {
    const d = parseCheckDetail(checkDetailFixture({ code: "DRAFTS" }), "DRAFTS");
    expect(d.rows[0]).toMatchObject({ voucherNo: "pmt00088", amount: "15000.00" });
    expect(d.truncated).toBe(false);
  });

  it("reads the export body and the voucher types", () => {
    const e = parseExport(exportFixture({ fromDate: "2026-10-09" }));
    expect(e.summary.typeTotals.amount).toBe("495270.00");
    expect(e.vouchers).toHaveLength(65);
    expect(e.totals).toBeNull();
    expect(e.totalRows).toBe(65);
    const types = parseVoucherTypes(voucherTypesFixture());
    expect(types[0]).toEqual({
      voucherTypeId: 24,
      code: "Jrl",
      short: "Jrl",
      name: "Journal",
      nature: "JOURNAL",
      category: "ACCOUNTING",
      sortOrder: 30,
    });
  });
});
