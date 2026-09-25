import { describe, expect, it } from "vitest";
import {
  dailyFixture,
  exportFixture,
  headerFixture,
  ledgersFixture,
  monthlyFixture,
  voucherLegsFixture,
  vouchersFixture,
} from "../testing/fixtures";
import {
  LedgerParseError,
  parseDaily,
  parseExport,
  parseHeader,
  parseLedgers,
  parseMonthly,
  parseVoucherLegs,
  parseVouchers,
} from "./parse";

describe("parse — the worked example", () => {
  it("reads every route's fixture", () => {
    const header = parseHeader(headerFixture());
    expect(header.period.opening).toEqual({ amount: "185200.00", side: "DR" });
    expect(header.period.closing).toEqual({ amount: "176300.00", side: "DR" });
    expect(header.ledger.creditLimit).toBeNull();

    const page = parseVouchers(vouchersFixture());
    expect(page.rows).toHaveLength(14);
    expect(page.page.totalRows).toBe(14);
    expect(page.rows.filter((r) => r.asPerDetails)).toHaveLength(2);
    expect(page.rows.map((r) => r.rowKind)).toContain("CANCELLED");
    expect(page.rows.map((r) => r.rowKind)).toContain("REVERSAL");
    // A src whose three fields are all null is "no source".
    expect(page.rows.find((r) => r.rowKind === "REVERSAL")?.src).toBeNull();

    expect(parseLedgers(ledgersFixture()).items.length).toBeGreaterThan(1);
    expect(parseMonthly(monthlyFixture()).months).toHaveLength(12);
    expect(parseDaily(dailyFixture()).days.length).toBeGreaterThan(0);
    expect(parseExport(exportFixture()).rows).toHaveLength(14);
    const legs = parseVoucherLegs(voucherLegsFixture({ voucherId: page.rows[1].voucherId }));
    expect(legs.legs.some((l) => l.isThisLedger)).toBe(true);
  });

  it("keeps inline legs when the server sends them (withLegs)", () => {
    const page = parseVouchers(vouchersFixture({ withLegs: "true" }));
    expect(page.rows[0].legs?.length).toBeGreaterThan(0);
  });

  it("accepts a bare payload as well as the envelope", () => {
    const bare = (headerFixture() as { data: unknown }).data;
    expect(parseHeader(bare).ledger.name).toBe("Sri Krishna Traders");
  });

  it("accepts side:null on a zero balance (the plan's form)", () => {
    const raw = structuredClone(headerFixture()) as { data: { period: { opening: unknown } } };
    raw.data.period.opening = { amount: "0.00", side: null };
    expect(parseHeader(raw).period.opening).toEqual({ amount: "0.00", side: null });
  });
});

describe("parse — fails loudly, never a silent zero", () => {
  function brokenVouchers(mutate: (row: Record<string, unknown>) => void) {
    const raw = structuredClone(vouchersFixture()) as { data: { rows: Record<string, unknown>[] } };
    mutate(raw.data.rows[3]);
    return raw;
  }

  it("throws on a missing amount instead of defaulting to 0.00", () => {
    expect(() => parseVouchers(brokenVouchers((r) => delete r.debit))).toThrow(LedgerParseError);
  });

  it("refuses a number where an amount string belongs", () => {
    expect(() => parseVouchers(brokenVouchers((r) => (r.credit = 3200)))).toThrow(/amount string/);
  });

  it("names the route and the path", () => {
    try {
      parseVouchers(brokenVouchers((r) => delete r.balance));
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(LedgerParseError);
      expect((error as LedgerParseError).route).toBe("vouchers");
      expect((error as LedgerParseError).path).toBe("$.rows[3].balance");
    }
  });

  it("refuses an unknown row kind and an unknown side", () => {
    expect(() => parseVouchers(brokenVouchers((r) => (r.rowKind = "VOID")))).toThrow(/rowKind/);
    expect(() =>
      parseVouchers(brokenVouchers((r) => (r.balance = { amount: "1.00", side: "D" }))),
    ).toThrow(/side/);
  });

  it("treats optionals as optional", () => {
    const raw = brokenVouchers((r) => {
      delete r.narration;
      delete r.pairOutsideRange;
      delete r.billRefs;
      delete r.src;
    });
    const row = parseVouchers(raw).rows[3];
    expect(row.narration).toBeNull();
    expect(row.pairOutsideRange).toBe(false);
    expect(row.billRefs).toEqual([]);
    expect(row.src).toBeNull();
  });
});
