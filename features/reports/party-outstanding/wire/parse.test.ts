import { describe, expect, it } from "vitest";
import { billsFixture, partiesFixture, partyFixture, PARTY_SKT } from "../testing/fixtures";
import { OutstandingParseError, parseBills, parseParties, parseParty } from "./parse";

const Q = { asOn: "2026-09-25", side: "RECEIVABLE" };

describe("parseParties", () => {
  it("reads the mockup's nine rows with their labels", () => {
    const data = parseParties(partiesFixture(Q));
    expect(data.rows).toHaveLength(9);
    expect(data.bucketLabels).toEqual(["0–30", "31–60", "61–90", "91–180", "> 180"]);
    expect(data.rows[0]).toMatchObject({ name: "Sri Krishna Traders", owed: "180300.00", flags: ["CHQ_BOUNCED"] });
    expect(data.totals.net).toEqual({ amount: "679550.00", side: "DR" });
    expect(data.page).toEqual({ page: 1, pageSize: 200, totalRows: 9 });
  });

  it("refuses a row whose buckets are not as long as the labels", () => {
    expect(() => parseParties(partiesFixture(Q, { bucketsShort: true }))).toThrow(OutstandingParseError);
    expect(() => parseParties(partiesFixture(Q, { bucketsShort: true }))).toThrow(
      /rows\[0\]\.buckets has 4 amounts for 5 bucket labels/,
    );
  });

  it("refuses a row with no net, and never defaults an amount to 0.00", () => {
    const raw = partiesFixture(Q);
    delete (raw.data.rows[2] as Partial<(typeof raw.data.rows)[number]>).net;
    expect(() => parseParties(raw)).toThrow(/rows\[2\]\.net is missing/);

    const missingOwed = partiesFixture(Q);
    delete (missingOwed.data.rows[1] as Partial<(typeof missingOwed.data.rows)[number]>).owed;
    expect(() => parseParties(missingOwed)).toThrow(/rows\[1\]\.owed is not an amount string/);
  });

  it("refuses an amount sent as a number", () => {
    const raw = partiesFixture(Q) as unknown as { data: { rows: Array<Record<string, unknown>> } };
    raw.data.rows[0].overdue = 170500;
    expect(() => parseParties(raw)).toThrow(/overdue is not an amount string/);
  });

  it("accepts a bare payload as well as the envelope", () => {
    expect(parseParties(partiesFixture(Q).data).rows).toHaveLength(9);
  });

  it("keeps an unknown flag rather than dropping it", () => {
    const raw = partiesFixture(Q);
    raw.data.rows[1].flags = ["NEW_FLAG"];
    expect(parseParties(raw).rows[1].flags).toEqual(["NEW_FLAG"]);
  });
});

describe("parseParty / parseBills", () => {
  it("lines the card's ageing up with its labels", () => {
    const card = parseParty(partyFixture({ ...Q, partyId: PARTY_SKT }));
    expect(card.ageing.amounts).toEqual(["10150.00", "92650.00", "18500.00", "59000.00", "0.00"]);
    expect(card.lastSettlement).toMatchObject({ voucherNo: "rct00017", amount: "21200.00", voucherBranchId: null });
  });

  it("refuses an ageing list shorter than its labels", () => {
    const raw = partyFixture({ ...Q, partyId: PARTY_SKT });
    raw.data.ageing.amounts = raw.data.ageing.amounts.slice(0, 3);
    expect(() => parseParty(raw)).toThrow(/ageing\.amounts has 3 amounts for 5 bucket labels/);
  });

  it("reads the bills with the forward fields absent", () => {
    const bills = parseBills(billsFixture({ ...Q, partyId: PARTY_SKT }));
    expect(bills.rows).toHaveLength(9);
    expect(bills.rows[0]).toMatchObject({ branchId: null, voucherTypeId: null, dataWarning: null });
    expect(bills.totals).toEqual({ bills: 9, billAmount: "216800.00", adjusted: "40500.00", net: { amount: "176300.00", side: "DR" } });
    expect(bills.ledgerClosing).toEqual({ amount: "176300.00", side: "DR" });
  });
});
