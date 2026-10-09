import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { billsFixture, partiesFixture, PARTY_SKT } from "../testing/fixtures";
import { parseBills, parseParties } from "../wire/parse";
import { billCells, ledgerCheck, partyCells, totalCells, type GridContext } from "./cells";
import { buildTiles, bucketAfterEdge } from "./tiles";

const Q = { asOn: "2026-09-25", side: "RECEIVABLE" };
const ctx: GridContext = { side: "RECEIVABLE", edges: [30, 60, 90, 180] };

const parties = () => parseParties(partiesFixture(Q));
const sktBills = (ledgerClosing?: { amount: string; side: "DR" | "CR" }) =>
  parseBills(billsFixture({ ...Q, partyId: PARTY_SKT }, ledgerClosing ? { ledgerClosing } : {}));

/** A row as the mockup prints it, left to right. */
function line(c: ReturnType<typeof partyCells>): string[] {
  return [
    c.name,
    ...c.flags.map((f) => `[${f.label}]`),
    c.area,
    c.crDays,
    c.bills,
    c.owed.text,
    c.onAccount.text,
    c.net.text,
    ...c.buckets.map((b) => b.text),
    c.overdue.text,
    c.oldest.text,
    c.pdc.text,
  ];
}

describe("the party grid reproduces the mockup", () => {
  it("prints every row to the character", () => {
    const rows = parties().rows.map((row) => line(partyCells(row, ctx)));
    expect(rows).toEqual([
      ["Sri Krishna Traders", "[CHQ BOUNCED]", "Trichy", "30", "8", "1,80,300.00", "4,000.00", "1,76,300.00 Dr", "10,150.00", "92,650.00", "18,500.00", "59,000.00", "", "1,70,500.00", "178 d", "20,000.00"],
      ["Murugan Agencies", "Erode", "45", "11", "1,68,700.00", "", "1,68,700.00 Dr", "62,500.00", "48,800.00", "36,400.00", "21,000.00", "", "70,200.00", "120 d", "40,000.00"],
      ["Kavery Distributors", "Namakkal", "60", "9", "1,58,500.00", "", "1,58,500.00 Dr", "55,000.00", "61,200.00", "42,300.00", "", "", "42,300.00", "84 d", "50,000.00"],
      ["Lakshmi Stores", "Karur", "15", "5", "59,500.00", "", "59,500.00 Dr", "41,200.00", "18,300.00", "", "", "", "30,700.00", "44 d", ""],
      ["Selvam & Co", "[> 180 DAYS]", "Salem", "30", "3", "48,600.00", "", "48,600.00 Dr", "", "", "", "", "48,600.00", "48,600.00", "245 d", ""],
      ["Vinayaga Hotels", "Karur", "30", "4", "34,700.00", "", "34,700.00 Dr", "12,000.00", "14,500.00", "8,200.00", "", "", "22,700.00", "72 d", ""],
      ["Balaji Provisions", "Dindigul", "21", "6", "32,000.00", "2,500.00", "29,500.00 Dr", "22,400.00", "9,600.00", "", "", "", "12,700.00", "38 d", ""],
      ["Ganesh Bakery", "Trichy", "7", "14", "18,750.00", "", "18,750.00 Dr", "18,750.00", "", "", "", "", "6,250.00", "19 d", ""],
      ["Anand Supermarket", "[ADVANCE]", "Trichy", "30", "", "", "15,000.00", "15,000.00 Cr", "", "", "", "", "", "", "", ""],
    ]);
  });

  it("prints the totals row from /parties.totals", () => {
    const data = parties();
    expect(line(totalCells(data.totals, data.page.totalRows, ctx))).toEqual([
      "Total · 9 parties", "", "", "60", "7,01,050.00", "21,500.00", "6,79,550.00 Dr",
      "2,22,000.00", "2,45,050.00", "1,05,400.00", "80,000.00", "48,600.00", "4,03,950.00", "", "1,10,000.00",
    ]);
  });

  it("colours as the mockup does", () => {
    const rows = parties().rows.map((row) => partyCells(row, ctx));
    expect(rows[0].buckets.map((b) => b.tone)).toEqual([null, null, "amber", "orange", "danger"]);
    expect(rows.map((r) => r.oldest.tone)).toEqual(["danger", "danger", "amber", null, "danger", "amber", null, null, null]);
    expect(rows[8].net.tone).toBe("credit");
    expect(rows[0].net.tone).toBe("accent");
  });
});

describe("the six tiles", () => {
  it("print the mockup's values and captions", () => {
    const tiles = buildTiles(parties().tiles, { side: "RECEIVABLE", deductPdc: false });
    expect(tiles.map((t) => [t.heading, t.value, t.caption])).toEqual([
      ["Net outstanding", "6,79,550.00 Dr", "9 parties · 60 bills"],
      ["Overdue", "4,03,950.00", "57% of pending bills"],
      ["Above 90 days", "1,28,600.00", "3 parties"],
      ["On-account credit", "21,500.00", "advances + unadjusted notes"],
      ["PDC in hand", "1,10,000.00", "3 cheques · not deducted"],
      ["Due next 7 days", "1,26,450.00", "26-09 → 02-10"],
    ]);
    expect(buildTiles(parties().tiles, { side: "RECEIVABLE", deductPdc: true })[4].caption).toBe("3 cheques · deducted");
  });

  it("finds the bucket after an edge, Not-due bucket or not", () => {
    expect(bucketAfterEdge(90, [30, 60, 90, 180], 5)).toBe(3);
    expect(bucketAfterEdge(90, [30, 60, 90, 180], 6)).toBe(4);
    expect(bucketAfterEdge(45, [30, 60, 90, 180], 5)).toBeNull();
  });
});

describe("the bills grid reproduces the mockup", () => {
  function bill(c: ReturnType<typeof billCells>): string[] {
    return [c.date, c.chip.label, c.refno, c.branch, c.due.text, c.billAmount, c.adjusted, c.pending.text, c.age.text, c.overdue.text, c.remarks];
  }

  it("prints Sri Krishna Traders' nine open items", () => {
    expect(sktBills().rows.map((row) => bill(billCells(row, ctx)))).toEqual([
      ["31-03-2026", "OPENING", "opn00028", "Main Store", "30-04-2026", "60,500.00", "25,000.00", "35,500.00 Dr", "178", "148 d", "part rct00002"],
      ["22-06-2026", "SALES", "bil00361", "Main Store", "22-07-2026", "38,500.00", "15,000.00", "23,500.00 Dr", "95", "65 d", "part rct00002"],
      ["18-07-2026", "SALES", "bil00377", "Main Store", "17-08-2026", "18,500.00", "", "18,500.00 Dr", "69", "39 d", "re-opened · chq bounced"],
      ["02-08-2026", "SALES", "bil00398", "Main Store", "01-09-2026", "32,400.00", "", "32,400.00 Dr", "54", "24 d", "12 items"],
      ["11-08-2026", "SALES", "bil00412", "Main Store", "10-09-2026", "48,600.00", "500.00", "48,100.00 Dr", "45", "15 d", "disc jv00007"],
      ["24-08-2026", "SALES", "bil00501", "Karur", "23-09-2026", "12,150.00", "", "12,150.00 Dr", "32", "2 d", ""],
      ["28-08-2026", "CR NOTE", "crn00014", "Main Store", "—", "4,000.00", "", "4,000.00 Cr", "28", "", "on account"],
      ["02-09-2026", "SALES", "bil00577", "Main Store", "02-10-2026", "9,800.00", "", "9,800.00 Dr", "23", "", ""],
      ["09-09-2026", "BNC CHARGE", "BNC/114402", "Main Store", "09-09-2026", "350.00", "", "350.00 Dr", "16", "16 d", "bounce charge"],
    ]);
  });

  it("reds an overdue due date, greens an on-account pending", () => {
    const cells = sktBills().rows.map((row) => billCells(row, ctx));
    expect(cells[0].due.tone).toBe("danger");
    expect(cells[7].due.tone).toBeNull();
    expect(cells[6].pending.tone).toBe("credit");
    expect(cells.map((c) => c.age.tone)).toEqual(["danger", "danger", null, null, null, null, null, null, null]);
  });

  it("shows the effective due date muted and italic when the bill has none", () => {
    const row = { ...sktBills().rows[1], dueDate: null };
    expect(billCells(row, ctx).due).toMatchObject({ text: "22-07-2026", italic: true, title: expect.stringContaining("bill date + credit days") });
  });

  it("appends the counter hint, and keeps the data warning", () => {
    const row = { ...sktBills().rows[3], tenderDerived: true, dataWarning: "ALLOC_BELOW_ROWS" };
    const c = billCells(row, ctx);
    expect(c.remarks).toBe("12 items · paid at counter");
    expect(c.warning).toBe("ALLOC_BELOW_ROWS");
  });

  it("reads Payable sides the other way round", () => {
    const row = sktBills().rows[0];
    expect(billCells(row, { ...ctx, side: "PAYABLE" }).pending.text).toBe("35,500.00 Cr");
  });
});

describe("the ledger check", () => {
  it("says = ledger closing ✓ when the two agree", () => {
    const b = sktBills();
    expect(ledgerCheck(b.totals.net, b.ledgerClosing)).toEqual({ ok: true, text: "= ledger closing ✓" });
  });

  it("says ≠ ledger in red when they do not, and never hides it", () => {
    const b = sktBills({ amount: "180300.00", side: "DR" });
    expect(ledgerCheck(b.totals.net, b.ledgerClosing)).toMatchObject({ ok: false, text: "≠ ledger 1,80,300.00 Dr" });
    const flipped = sktBills({ amount: "176300.00", side: "CR" });
    expect(ledgerCheck(flipped.totals.net, flipped.ledgerClosing).ok).toBe(false);
  });
});

describe("no date arithmetic", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("prints the same cells with the clock frozen years away from As on", () => {
    const before = sktBills().rows.map((row) => billCells(row, ctx));
    const partiesBefore = parties().rows.map((row) => partyCells(row, ctx));
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2031-02-14T23:59:00+05:30"));
    expect(sktBills().rows.map((row) => billCells(row, ctx))).toEqual(before);
    expect(parties().rows.map((row) => partyCells(row, ctx))).toEqual(partiesBefore);
    vi.setSystemTime(new Date("2019-07-01T00:00:00Z"));
    expect(sktBills().rows.map((row) => billCells(row, ctx))).toEqual(before);
  });

  it.each(["cells.ts", "tiles.ts"])("%s neither reads the clock nor parses an amount", (file) => {
    const source = readFileSync(fileURLToPath(new URL(`./${file}`, import.meta.url)), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    for (const call of ["new Date", "Date.now", "Number(", "parseFloat(", "parseInt(", "Intl.NumberFormat", "toFixed("]) {
      expect(source).not.toContain(call);
    }
  });
});
