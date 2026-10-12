import { describe, expect, it } from "vitest";
import { summaryFixture } from "../testing/fixtures";
import { checkSentence, checkText, hasDetail, sortChecks } from "./checks";
import { parseSummary } from "./parse";
import type { Check, CheckLevel } from "./types";

const c = (code: string, level: CheckLevel, facts: Record<string, unknown> = {}): Check => ({ code, level, facts });

describe("the mockup's checks, word for word", () => {
  it("prints each card in FAIL, WARN, INFO, OK order", () => {
    const checks = sortChecks(parseSummary(summaryFixture({ branchId: "main" })).checks);
    // The server's facts (no draft or pair voucher numbers, both clearing ledgers pending).
    expect(checks.map((check) => [check.level, checkText(check).heading, checkText(check).line])).toEqual([
      ["WARN", "2 drafts not in figures", "15,640.00 in draft documents"],
      ["WARN", "Clearing pending", "Card clearing 38,400.00 · UPI clearing 33,220.00 — settles T+1 (Settlement, menu 278)"],
      ["WARN", "Business day OPEN", "Day Close (menu 274) not run — tills 2 of 3 closed"],
      ["INFO", "1 cancelled pair", "both halves listed on the Vouchers tab · net 0.00"],
      ["OK", "Dr = Cr", "4,95,270.00 = 4,95,270.00 — every posted voucher balanced"],
      ["OK", "Voucher amount = Σ Dr", "types grid total 4,95,270.00"],
      ["OK", "Vouchers with no entries", "none — every voucher has ledger lines"],
      ["OK", "Numbering", "no gaps"],
    ]);
  });

  it("words the richer facts the react plan assumed, when a server sends them", () => {
    expect(
      checkText(c("DRAFTS", "WARN", { count: 2, items: [{ voucherNo: "pmt00088", amount: "15000.00" }, { voucherNo: "exv00041", amount: "640.00" }] })).line,
    ).toBe("pmt00088 · 15,000.00   ·   exv00041 · 640.00");
    expect(checkText(c("CANCELLED_PAIRS", "INFO", { pairs: 1, items: [{ original: "bil01431", mirror: "bil01432" }] })).line).toBe(
      "bil01431 / bil01432 (mirror) · net 0.00",
    );
    expect(
      checkText(c("CLEARING_PENDING", "WARN", { ledgers: [{ ledgerName: "Card clearing", closing: { amount: "38400.00", side: "DR" } }] })),
    ).toEqual({ heading: "Card clearing 38,400.00", line: "settles T+1 (Settlement, menu 278)" });
    expect(
      checkText(
        c("NUMBER_GAPS", "OK", {
          series: [{ series: "Bil · Main Store", lo: "bil01412", hi: "bil01454", deleted: [], unused: [] }],
        }),
      ).line,
    ).toBe("no gaps: bil01412–bil01454");
  });
});

describe("every code × level", () => {
  it("BALANCED fails with a count", () => {
    expect(checkText(c("BALANCED", "FAIL", { debit: "10.00", credit: "9.00", unbalancedVouchers: 3, voucherIds: ["x"] }))).toEqual({
      heading: "Dr ≠ Cr",
      line: "3 vouchers do not balance",
    });
    expect(checkText(c("BALANCED", "FAIL", { debit: "10.00", credit: "9.00" })).line).toBe("Dr 10.00 ≠ Cr 9.00");
  });

  it("AMOUNT_TIES fails as a support case", () => {
    expect(checkText(c("AMOUNT_TIES", "FAIL", { typeAmount: "1.00" })).line).toBe(
      "the report disagrees with itself — tell support",
    );
    expect(checkText(c("AMOUNT_TIES", "OK", { typeAmount: "10.00", moneyChecked: false })).line).toBe(
      "types grid total 10.00 · money ledgers not cross-checked for one type",
    );
  });

  it("LEGLESS warns with a count", () => {
    expect(checkText(c("LEGLESS", "WARN", { count: 12 }))).toEqual({
      heading: "Vouchers with no entries",
      line: "12 vouchers carry no ledger lines",
    });
    expect(checkText(c("LEGLESS", "WARN", { count: 1 })).line).toBe("1 voucher carries no ledger lines");
  });

  it("DRAFTS lists at most three", () => {
    const items = [1, 2, 3, 4].map((n) => ({ voucherNo: `pmt0000${n}`, amount: `${n}000.00` }));
    expect(checkText(c("DRAFTS", "WARN", { count: 4, items })).line).toBe(
      "pmt00001 · 1,000.00   ·   pmt00002 · 2,000.00   ·   pmt00003 · 3,000.00",
    );
    expect(checkText(c("DRAFTS", "OK", { count: 0 })).heading).toBe("No drafts");
  });

  it("CANCELLED_PAIRS mentions lone halves", () => {
    expect(checkText(c("CANCELLED_PAIRS", "INFO", { pairs: 2, loneHalves: 1 }))).toEqual({
      heading: "2 cancelled pairs",
      line: "both halves listed on the Vouchers tab · net 0.00 · + 1 lone half (other half outside the range)",
    });
    expect(checkText(c("CANCELLED_PAIRS", "INFO", { pairs: 0, loneHalves: 2 })).line).toBe(
      "+ 2 lone halves (other half outside the range)",
    );
  });

  it("CLEARING_PENDING names several ledgers without adding them", () => {
    expect(
      checkText(
        c("CLEARING_PENDING", "WARN", {
          amount: "71620.00",
          ledgers: [
            { ledgerName: "Card clearing", closing: { amount: "38400.00", side: "DR" } },
            { ledgerName: "UPI clearing", closing: { amount: "33220.00", side: "DR" } },
          ],
        }),
      ),
    ).toEqual({
      heading: "Clearing 71,620.00",
      line: "Card clearing 38,400.00 · UPI clearing 33,220.00 — settles T+1 (Settlement, menu 278)",
    });
  });

  it("BUSINESS_DAY reads each status", () => {
    expect(checkText(c("BUSINESS_DAY", "OK", { status: "CLOSED", zNo: "Z0042" }))).toEqual({
      heading: "Business day CLOSED",
      line: "Day Close done · Z Z0042",
    });
    expect(checkText(c("BUSINESS_DAY", "INFO", { status: "NONE" })).heading).toBe("No till day");
    expect(checkText(c("BUSINESS_DAY", "WARN", { status: "MIXED" })).heading).toBe("Business day differs by branch");
    expect(checkText(c("BUSINESS_DAY", "WARN", { status: "CLOSING" })).heading).toBe("Business day CLOSING");
  });

  it("FUTURE_DATED counts", () => {
    expect(checkText(c("FUTURE_DATED", "INFO", { count: 24, lastDate: "2026-11-08", today: "2026-10-12" }))).toEqual({
      heading: "24 vouchers dated after today",
      line: "the latest on 08-11-2026",
    });
  });

  it("NUMBER_GAPS tells deleted from unused", () => {
    expect(
      checkText(
        c("NUMBER_GAPS", "INFO", {
          series: [
            { series: "Bil", lo: 1412, hi: 1453, deleted: [1420, 1421], unused: [1440] },
            { series: "Rct", lo: 121, hi: 126, deleted: [], unused: [] },
          ],
        }),
      ),
    ).toEqual({ heading: "Numbering", line: "Bil 3 missing (2 deleted, 1 unused)" });
    // The server's series: counts beyond the 50-number lists, named by type and branch.
    expect(
      checkText(
        c("NUMBER_GAPS", "INFO", {
          series: [{ short: "Pmt", branchName: "Main Store", lo: 80, hi: 200, deletedCount: 1, unusedCount: 60, deleted: [81], unused: [90] }],
        }),
      ).line,
    ).toBe("Pmt · Main Store 61 missing (1 deleted, 60 unused)");
  });

  it("an unknown code renders as itself, with its level", () => {
    const check = c("STOCK_NEGATIVE", "FAIL", { count: 2 });
    expect(checkText(check)).toEqual({ heading: "STOCK_NEGATIVE", line: null });
    expect(checkSentence(check)).toBe("STOCK_NEGATIVE");
  });

  it("offers 'show' only where rows sit behind a non-OK check", () => {
    expect(hasDetail(c("DRAFTS", "WARN"))).toBe(true);
    expect(hasDetail(c("NUMBER_GAPS", "OK"))).toBe(false);
    expect(hasDetail(c("BALANCED", "FAIL"))).toBe(false);
  });
});
