/**
 * Sale Bill Entry — party-context (§7.3), the credit panel (§7.4), the facts
 * line (§7.5) and the term rules (§7.2, §7.6). Pure.
 */
import { describe, expect, it } from "vitest";
import {
  clampDueDays,
  creditAlertMessage,
  creditExhausted,
  creditPanelRows,
  factsLine,
  parsePartyContext,
  partyTerm,
  termForcedToParty,
  toDecimal,
} from "@/features/sales/testbill/domain/party";

const RAW = {
  success: true,
  message: "Party context fetched",
  data: {
    party: {
      ledId: "cust-1",
      name: "ACME TRADERS",
      gstType: "REGULAR",
      gstin: "33AAAAA0000A1Z5",
      stateCode: "33",
      isWalkIn: false,
      panNo: "AAAAA0000A",
      panVerifiedOn: "2026-01-10",
      form60On: null,
      creditAllowed: true,
      defaultPriceLevel: 2,
      addr: "1, Main Rd, Anna Nagar",
      place: "CHENNAI",
      pin: "600040",
      phone: "9876543210",
      areaId: "area-1",
      areaName: "ANNA NAGAR",
      distanceKm: "12",
      salesmanId: "emp-1",
      salesmanName: "RAVI",
      freightCharge: true,
      loadingCharge: false,
      unloadingCharge: false,
      allowDiscount: true,
      allowPromotion: true,
      allowLoyalty: true,
    },
    credit: {
      limitAmount: "50000",
      limitBills: 5,
      creditDays: 30,
      used: "61000.5",
      openBills: 3,
      oldestOpenDays: 41,
      amtExceeded: true,
      billExceeded: false,
      daysExceeded: true,
      mode: "REFUSE",
    },
    cashToday: "1500",
    advances: [{ ablId: "abl-1", ablAccYear: "2026-2027 ", refno: "ADV-1", pending: "300", date: "2026-09-01T00:00:00.000Z" }],
    creditNotes: [],
    loyalty: { memberId: "mem-1", cardNo: "CARD9", balance: "120", redeemable: "100", rate: "0.5", minPoints: 50, maxPoints: 1000, maxRedeemAmount: 200, multiple: 10, schemeId: "ls-1", allowPointRedeem: true },
    shipTo: [{ saaId: "saa-1", name: "Site A", addr: "Plot 4", place: "AMBATTUR", pin: "600053", stcd: "33", gstin: null, phone: null, distanceKm: 18, isDefault: true }],
    tempCredits: [{ atcId: "atc-1", billRefno: "bil00700", name: "KUMAR", mobile: "9000000000", balance: "450", dueDate: "2026-09-30" }],
    openSources: { dc: "1", orders: 2 },
  },
};

describe("parsePartyContext", () => {
  it("reads every figure leniently and keys the reply by the customer it was asked for", () => {
    const context = parsePartyContext(RAW, "cust-1", "2026-09-25");
    expect(context.partyId).toBe("cust-1");
    expect(context.billDate).toBe("2026-09-25");
    expect(context.credit.limitAmount).toBe(50000);
    expect(context.credit.used).toBe(61000.5);
    expect(context.credit.mode).toBe("REFUSE");
    expect(context.cashToday).toBe(1500);
    expect(context.advances[0]).toEqual({ ablId: "abl-1", ablAccYear: "2026-2027", refno: "ADV-1", pending: 300, date: "2026-09-01" });
    expect(context.loyalty?.rate).toBe(0.5);
    expect(context.loyalty?.allowPointRedeem).toBe(true);
    expect(context.shipTo[0].distanceKm).toBe(18);
    expect(context.tempCredits[0].balance).toBe(450);
    expect(context.openSources).toEqual({ dc: 1, orders: 2 });
    expect(context.party.distanceKm).toBe(12);
  });

  it("reads `loyalty: null` as NOT A MEMBER — an answer, not missing data", () => {
    const context = parsePartyContext({ data: { ...RAW.data, loyalty: null } }, "cust-1", "2026-09-25");
    expect(context.loyalty).toBeNull();
  });

  it("survives an empty body", () => {
    const context = parsePartyContext({}, "cust-9", "2026-09-25");
    expect(context.party.ledId).toBe("cust-9");
    expect(context.credit.mode).toBe("OFF");
    expect(context.advances).toEqual([]);
  });

  it("toDecimal accepts numbers, numeric strings and exponent form", () => {
    expect(toDecimal("1234.5")).toBe(1234.5);
    expect(toDecimal("1e-7")).toBe(1e-7);
    expect(toDecimal(null, 3)).toBe(3);
    expect(toDecimal("abc", 0)).toBe(0);
  });
});

describe("creditPanelRows (§7.4)", () => {
  const credit = parsePartyContext(RAW, "cust-1", "2026-09-25").credit;

  it("paints Pending as `amount (count)`, red on overdue days while the check is on", () => {
    const rows = creditPanelRows(credit);
    const pending = rows.find((row) => row.label === "Pending")!;
    expect(pending.value).toBe("61,000.50 (3)");
    expect(pending.alert).toBe(true);
    expect(pending.tooltip).toContain("oldest open bill 41 day(s), terms 30 day(s)");
  });

  it("Avail is red on an amount breach, with the reason", () => {
    const avail = creditPanelRows(credit).find((row) => row.label === "Avail")!;
    expect(avail.alert).toBe(true);
    expect(avail.tooltip).toBe("Over the credit limit");
    expect(avail.value).toContain("0.00");
  });

  it("limit 0 = no limit, and nothing is red once the check is OFF", () => {
    const rows = creditPanelRows({ ...credit, limitAmount: 0, limitBills: 0, mode: "OFF" });
    expect(rows.find((row) => row.label === "Limit")!.value).toBe("no limit");
    expect(rows.find((row) => row.label === "Avail")!.value).toBe("—");
    expect(rows.every((row) => !row.alert)).toBe(true);
  });

  it("says 'no credit days' when the party has none", () => {
    expect(creditPanelRows({ ...credit, creditDays: 0 }).find((row) => row.label === "Overdue")!.value).toBe("no credit days");
  });
});

describe("creditAlertMessage — one popup per operator pick (§7.4)", () => {
  const context = parsePartyContext(RAW, "cust-1", "2026-09-25");

  it("names every reason when the check REFUSES and credit is allowed", () => {
    const message = creditAlertMessage(context);
    expect(message).toContain("ACME TRADERS is over the credit limit, overdue (oldest bill 41 day(s))");
    expect(message).toContain("a credit bill will be refused");
  });

  it("stays silent under WARN, for a cash-only party, or with nothing exceeded", () => {
    expect(creditAlertMessage({ ...context, credit: { ...context.credit, mode: "WARN" } })).toBeNull();
    expect(creditAlertMessage({ ...context, party: { ...context.party, creditAllowed: false } })).toBeNull();
    expect(
      creditAlertMessage({
        ...context,
        credit: { ...context.credit, amtExceeded: false, billExceeded: false, daysExceeded: false },
      }),
    ).toBeNull();
  });

  it("creditExhausted reads only the amount and bill flags, and never when OFF", () => {
    expect(creditExhausted(context.credit)).toBe(true);
    expect(creditExhausted({ ...context.credit, amtExceeded: false })).toBe(false);
    expect(creditExhausted({ ...context.credit, mode: "OFF" })).toBe(false);
    expect(creditExhausted(null)).toBe(false);
  });
});

describe("factsLine (§7.5)", () => {
  const context = parsePartyContext(RAW, "cust-1", "2026-09-25");
  const fallback = { gstType: null, gstin: null, stateCode: null };

  it("reads GST · PAN ✓ · advances · credit notes · cash today · temp credit", () => {
    const cells = factsLine(context, fallback, true);
    expect(cells.map((cell) => cell.text)).toEqual([
      "GST REGULAR · 33AAAAA0000A1Z5 · 33 · intra",
      "PAN AAAAA0000A ✓",
      "Advances 300.00 (1)",
      "Credit notes —",
      "Cash today 1,500.00",
      "Temp credit 450.00 (1)",
    ]);
    expect(cells[1].tone).toBe("green");
    expect(cells[4].tone).toBe("amber");
    expect(cells[3].tone).toBe("grey");
  });

  it("shows Form 60 with its date, and 'none' in amber when there is neither", () => {
    const form60 = factsLine({ ...context, party: { ...context.party, panNo: null, form60On: "2026-02-03" } }, fallback, false);
    expect(form60[1].text).toBe("Form 60 · 03-02-2026");
    const none = factsLine({ ...context, party: { ...context.party, panNo: null } }, fallback, false);
    expect(none[1].text).toBe("PAN / Form 60: none");
    expect(none[1].tone).toBe("amber");
    expect(none[0].text).toContain("inter");
  });

  it("is always shown — Clear resets it to grey dashes", () => {
    const cells = factsLine(null, fallback, true);
    expect(cells[0].text).toBe("GST — · intra");
    expect(cells.slice(2).every((cell) => cell.tone === "grey")).toBe(true);
  });
});

describe("the term (§7.2, §7.6)", () => {
  it("is forced to the party's unless the branch allows a change AND the bill has a source", () => {
    expect(termForcedToParty(false, false)).toBe(true);
    expect(termForcedToParty(false, true)).toBe(true);
    expect(termForcedToParty(true, false)).toBe(true);
    expect(termForcedToParty(true, true)).toBe(false);
  });

  it("partyTerm is Credit iff credit is allowed", () => {
    expect(partyTerm(true)).toBe("CREDIT");
    expect(partyTerm(false)).toBe("CASH");
  });

  it("clampDueDays keeps 0–3650", () => {
    expect(clampDueDays(-3)).toBe(0);
    expect(clampDueDays(30.7)).toBe(30);
    expect(clampDueDays(9999)).toBe(3650);
    expect(clampDueDays(Number.NaN)).toBe(0);
  });
});
