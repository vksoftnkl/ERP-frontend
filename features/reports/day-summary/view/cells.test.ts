import { afterEach, describe, expect, it, vi } from "vitest";
import { dailyFixture, groupLedgersFixture, GROUP_DEBTORS, summaryFixture, vouchersFixture } from "../testing/fixtures";
import { parseDaily, parseGroupLedgers, parseSummary, parseVouchers } from "../wire/parse";
import {
  dailyCells,
  groupCells,
  groupLedgerCells,
  groupMoneyRows,
  groupTotalCells,
  moneyCells,
  moneyTotalCells,
  tieOut,
  typeCells,
  typeTotalCells,
  voucherCells,
  voucherFootText,
} from "./cells";
import { buildTiles } from "./tiles";

/**
 * Every input the money formatters receive is recorded, so the test can say
 * that each one is a string the fixture (the server) sent: the client
 * computed no figure of its own.
 */
const { inputs } = vi.hoisted(() => ({ inputs: [] as unknown[] }));
vi.mock("@/features/reports/shared/wire/money", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/features/reports/shared/wire/money")>();
  const record =
    <A extends unknown[], R>(fn: (...args: A) => R) =>
    (...args: A): R => {
      inputs.push(args[0]);
      return fn(...args);
    };
  return {
    ...real,
    formatAmount: record(real.formatAmount),
    formatCell: record(real.formatCell),
    formatBal: record(real.formatBal),
  };
});

afterEach(() => {
  inputs.length = 0;
});

/** Every string anywhere in a wire payload. */
function wireStrings(raw: unknown, into = new Set<string>()): Set<string> {
  if (typeof raw === "string") into.add(raw);
  else if (Array.isArray(raw)) raw.forEach((v) => wireStrings(v, into));
  else if (raw && typeof raw === "object") Object.values(raw).forEach((v) => wireStrings(v, into));
  return into;
}

function expectAllFromWire(raw: unknown) {
  const sent = wireStrings(raw);
  expect(inputs.length).toBeGreaterThan(0);
  for (const input of inputs) {
    const amount = typeof input === "string" ? input : (input as { amount: string }).amount;
    expect(sent.has(amount), `formatted "${amount}", which the server never sent`).toBe(true);
  }
}

const raw = () => summaryFixture({ branchId: "b" });

describe("the Summary tab reproduces the mockup", () => {
  it("prints the voucher-type grid to the character, Total from typeTotals", () => {
    const wire = raw();
    const s = parseSummary(wire);
    const rows = s.types.map((t) => {
      const c = typeCells(t);
      return [c.chip.text, c.vouchers, c.drafts, c.cancelled.text, c.amount, c.cashIn, c.cashOut, c.bankIn, c.bankOut];
    });
    expect(rows).toEqual([
      ["SALES BILL", "41", "", "1 pair", "1,86,420.00", "92,300.00", "", "71,620.00", ""],
      ["SALES RETURN", "3", "", "", "4,860.00", "", "2,360.00", "", ""],
      ["RECEIPT", "6", "", "", "58,000.00", "18,000.00", "", "40,000.00", ""],
      ["PAYMENT", "4", "1", "", "1,22,500.00", "", "2,500.00", "", "1,20,000.00"],
      ["EXPENSE VOUCHER", "5", "1", "", "3,840.00", "", "3,840.00", "", ""],
      ["CONTRA", "2", "", "", "1,18,400.00", "", "80,000.00", "1,18,400.00", "38,400.00"],
      ["JOURNAL", "2", "", "", "1,250.00", "", "", "", ""],
    ]);
    const t = typeTotalCells(s.typeTotals);
    expect([t.vouchers, t.drafts, t.cancelled.text, t.amount, t.cashIn, t.cashOut, t.bankIn, t.bankOut]).toEqual([
      "63",
      "2",
      "1 pair",
      "4,95,270.00",
      "1,10,300.00",
      "88,700.00",
      "2,30,020.00",
      "1,58,400.00",
    ]);
    expectAllFromWire(wire);
  });

  it("flags lone halves with the tooltip", () => {
    const s = parseSummary(raw());
    const c = typeCells({ ...s.types[0], loneHalves: 1 });
    expect(c.cancelled).toEqual({ text: "1 pair +1 half", title: "a cancel whose other half is outside this range" });
  });

  it("prints the cash & bank position, grouped CASH → BANK → CLEARING, and the tie-out", () => {
    const wire = raw();
    const s = parseSummary(wire);
    const rows = groupMoneyRows([...s.moneyLedgers].reverse()).map((m) => {
      const c = moneyCells(m);
      return [c.ledger, c.opening, c.in, c.out, c.closing];
    });
    expect(rows).toEqual([
      ["Cash in Hand", "48,250.00", "1,10,300.00", "88,700.00", "69,850.00"],
      ["HDFC Bank CA", "3,12,400.00", "1,58,400.00", "1,20,000.00", "3,50,800.00"],
      // Server order within a kind (here reversed on purpose).
      ["UPI clearing", "0.00", "33,220.00", "0.00", "33,220.00"],
      ["Card clearing", "38,400.00", "38,400.00", "38,400.00", "38,400.00"],
    ]);
    const total = moneyTotalCells(s.moneyTotals.ALL);
    expect([total.opening, total.in, total.out, total.closing]).toEqual([
      "3,99,050.00",
      "3,40,320.00",
      "2,47,100.00",
      "4,92,270.00",
    ]);
    expect(tieOut(s, true)).toEqual({
      tone: "ok",
      heading: "✓  ties to the type grid",
      lines: [
        "Cash  in 1,10,300.00 · out 88,700.00",
        "Bank  in 1,58,400.00 · out 1,20,000.00",
        "+ clearing  in 71,620.00 · out 38,400.00",
      ],
    });
    expect(tieOut(s, false).lines).toHaveLength(2);
    expectAllFromWire(wire);
  });

  it("turns the tie-out red with the check's own sentence", () => {
    const s = parseSummary(summaryFixture({}, { checks: [{ code: "AMOUNT_TIES", level: "FAIL", facts: {} }] }));
    expect(tieOut(s, true)).toMatchObject({
      tone: "bad",
      heading: "✕  Voucher amount = Σ Dr — the report disagrees with itself — tell support",
    });
  });

  it("prints the group summary; the Net total is 0.00 only when BALANCED is OK", () => {
    const wire = raw();
    const s = parseSummary(wire);
    const rows = s.groups.map((g) => {
      const c = groupCells(g);
      return [c.name, c.nature, c.debit, c.credit, c.net.text];
    });
    expect(rows).toEqual([
      ["Cash-in-Hand", "Asset", "1,10,300.00", "88,700.00", "21,600.00 Dr"],
      ["Bank Accounts", "Asset", "1,58,400.00", "1,20,000.00", "38,400.00 Dr"],
      ["Card / UPI Clearing", "Asset", "71,620.00", "38,400.00", "33,220.00 Dr"],
      ["Sundry Debtors", "Asset", "22,500.00", "61,750.00", "39,250.00 Cr"],
      ["Sundry Creditors", "Liability", "1,22,500.00", "", "1,22,500.00 Dr"],
      ["Sales Accounts", "Income", "4,480.00", "1,71,820.00", "1,67,340.00 Cr"],
      ["Duties & Taxes  ·  GST", "Liability", "620.00", "14,600.00", "13,980.00 Cr"],
      ["Indirect Expenses", "Expense", "4,850.00", "", "4,850.00 Dr"],
    ]);
    expect(groupTotalCells(s.groupTotals, true)).toEqual({
      debit: "4,95,270.00",
      credit: "4,95,270.00",
      net: { text: "0.00", side: null },
    });
    expect(groupTotalCells(s.groupTotals, false).net.text).toBe("");
    expect(groupCells({ ...s.groups[0], nature: null }).nature).toBe("—");
    expectAllFromWire(wire);
  });

  it("prints the tiles in the server's order", () => {
    const wire = raw();
    const tiles = buildTiles(parseSummary(wire).tiles, { countDrafts: true });
    expect(tiles.map((t) => [t.heading, t.value, t.sub, t.tone])).toEqual([
      ["Sales", "1,86,420.00", "41 bills · 1 cancelled pair", "sales"],
      ["Sale returns", "4,860.00", "3 returns", "returns"],
      ["Receipts", "58,000.00", "6 receipts", "receipts"],
      ["Payments", "1,22,500.00", "4 posted · 1 draft", "payments"],
      ["Expenses", "3,840.00", "5 posted · 1 draft", "expenses"],
      ["Cash in hand", "69,850.00", "opening 48,250.00 · +21,600.00", "cash"],
    ]);
    expectAllFromWire(wire);
  });

  it("drops the draft clauses when Count drafts is off, and shows an unknown tile by its code", () => {
    const s = parseSummary(raw());
    const off = buildTiles(s.tiles, { countDrafts: false });
    expect(off[3].sub).toBe("4 payments");
    const unknown = buildTiles([{ code: "PURCHASES", amount: "10.00", vouchers: 1, drafts: null, cancelledPairs: null, opening: null, net: null, closing: null }], {
      countDrafts: true,
    });
    expect(unknown[0]).toEqual({ code: "PURCHASES", heading: "PURCHASES", value: "10.00", sub: "1 voucher", tone: "neutral" });
  });

  it("signs a falling cash balance from its side, never from a subtraction", () => {
    const tiles = buildTiles(
      [
        {
          code: "CASH_IN_HAND",
          amount: null,
          vouchers: null,
          drafts: null,
          cancelledPairs: null,
          opening: { amount: "5000.00", side: "DR" },
          net: { amount: "6200.00", side: "CR" },
          closing: { amount: "1200.00", side: "CR" },
        },
      ],
      { countDrafts: true },
    );
    expect([tiles[0].value, tiles[0].sub]).toEqual(["1,200.00 Cr", "opening 5,000.00 · −6,200.00"]);
  });
});

describe("under a voucher-type filter the server sends no balances", () => {
  it("prints a dash for every balance, never a zero, and leaves the tie-out unverdicted", () => {
    const s = parseSummary(summaryFixture({ branchId: "b", voucherTypeId: "3" }));
    const cash = moneyCells(s.moneyLedgers[0]);
    expect([cash.opening, cash.in, cash.out, cash.closing]).toEqual(["—", "1,10,300.00", "88,700.00", "—"]);
    const total = moneyTotalCells(s.moneyTotals.ALL);
    expect([total.opening, total.closing]).toEqual(["—", "—"]);
    expect(tieOut(s, true).tone).toBe("unknown");
    const tile = buildTiles(s.tiles, { countDrafts: true }).find((t) => t.code === "CASH_IN_HAND");
    expect([tile?.value, tile?.sub]).toEqual(["—", "net +21,600.00 · no balance for one type"]);
  });
});

describe("the Vouchers, Day-wise and group-ledger rows", () => {
  it("prints a voucher row; a cancelled pair reads as such", () => {
    const wire = vouchersFixture({ pageSize: "200" });
    const page = parseVouchers(wire);
    const [cancelled, reversal] = page.rows.filter((r) => r.pairInRange).map(voucherCells);
    expect(cancelled.chip).toMatchObject({ text: "BIL · CANCELLED", variant: "cancelled" });
    expect(reversal.chip).toMatchObject({ text: "BIL", variant: "reversal", tone: "payment" });
    const first = voucherCells(page.rows[0]);
    expect([first.date, first.chip.text, first.voucherNo, first.party.text, first.amount, first.branch]).toEqual([
      "09/10/2026",
      "BIL",
      "bil01412",
      "Cash Sales",
      "4,546.82",
      "Main Store",
    ]);
    // The server's totals carry no pair count yet; the clause appears when they do.
    expect(voucherFootText(page.page.totalRows, page.totals.cancelledPairs, false)).toBe("65 vouchers");
    expect(voucherFootText(65, 1, false)).toBe("65 vouchers · 1 cancelled pair");
    expect(voucherFootText(2, null, true)).toBe("2 drafts");
    expectAllFromWire(wire);
  });

  it("reads (as per details) only when the server says so", () => {
    const row = parseVouchers(vouchersFixture({ pageSize: "1" })).rows[0];
    expect(voucherCells({ ...row, party: null, particulars: null, asPerDetails: true }).party).toEqual({
      text: "(as per details)",
      muted: true,
    });
  });

  it("prints Day-wise rows with each day's own closing", () => {
    const wire = dailyFixture({ fromDate: "2026-10-08", toDate: "2026-10-09" });
    const rows = parseDaily(wire).rows.map(dailyCells);
    expect(rows[1]).toEqual({
      date: "09/10/2026",
      vouchers: "56",
      drafts: "1",
      cancelled: "1 pair",
      amount: "4,49,000.00",
      cashIn: "94,000.00",
      cashOut: "81,500.00",
      cashClosing: "52,500.00",
      bankIn: "2,10,000.00",
      bankOut: "1,52,000.00",
      bankClosing: "4,08,000.00",
      day: { text: "Open", status: "OPEN" },
    });
    expectAllFromWire(wire);
  });

  it("prints group ledgers", () => {
    const wire = groupLedgersFixture({ groupId: GROUP_DEBTORS });
    const rows = parseGroupLedgers(wire).rows.map(groupLedgerCells);
    expect(rows.map((c) => [c.name, c.nature, c.debit, c.credit, c.net.text])).toEqual([
      ["Sri Krishna Traders", "Sundry Debtors", "12,500.00", "40,000.00", "27,500.00 Cr"],
      ["Murugan Agencies", "Sundry Debtors", "10,000.00", "", "10,000.00 Dr"],
      ["Kavery Distributors", "Trichy Area", "", "21,750.00", "21,750.00 Cr"],
    ]);
    expectAllFromWire(wire);
  });
});
