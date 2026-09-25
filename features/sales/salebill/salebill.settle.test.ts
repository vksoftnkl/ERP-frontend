/**
 * Sale Bill Entry — settlement arithmetic (§15.4–15.9) and the adjust engine
 * (§14). Every case that names money is exact, in paise.
 */
import { describe, expect, it } from "vitest";
import type { AdjustableCredit, BillAdjustmentRow } from "./salebill.types";
import {
  adjustAll,
  adjustmentsAuthoritative,
  clampAdjustmentsToBill,
  mergeHeldCredits,
  reconcileNoticeText,
  reconcileRestoredAdjustments,
  rowsFromHeld,
} from "./salebill.adjust";
import {
  cashLimitLine,
  counterPaidOnLoad,
  fillShortfall,
  isValidPan,
  loyaltyFacts,
  loyaltyRedeem,
  releaseAdjustments,
  rollupsOf,
  routeChange,
  settleRows,
  settlementOutcome,
  type SettleRow,
} from "./salebill.settle";

function row(key: string, keyed: number, overrides: Partial<SettleRow> = {}): SettleRow {
  return { key, keyed, typeCode: "CARD", allowChange: false, surchargePerc: 0, surchargeFlat: 0, ...overrides };
}
const cash = (key: string, keyed: number) => row(key, keyed, { typeCode: "CASH", allowChange: true });

function credit(billId: string, pending: number, billType: AdjustableCredit["billType"] = "ADVANCE"): AdjustableCredit {
  return {
    billId,
    billAccYear: "2026-2027",
    billType,
    drCr: "CR",
    docRefno: billId.toUpperCase(),
    docDate: "2026-09-01",
    billAmount: pending,
    pendingAmount: pending,
    status: "OPEN",
    srcModule: null,
    srcDocType: null,
    srcDocId: null,
    srcAccYear: null,
    narration: null,
    adjType: billType === "ADVANCE" ? "ADVANCE_ADJUST" : "NOTE_ADJUST",
    settlementMode: billType === "ADVANCE" ? "ADVANCE" : "CREDIT_NOTE",
  };
}
const adj = (billId: string, amount: number, pending = amount): BillAdjustmentRow => ({
  key: `${billId}:2026-2027`,
  credit: credit(billId, pending),
  amount,
});

describe("settleRows — the surcharge is netted out of the balance", () => {
  it("bill 6,300 = cash 100 + card 1,000 + UPI 700 + cheque 4,500 → balance 0", () => {
    const { totals } = settleRows([cash("c", 100), row("card", 1000), row("upi", 700), row("chq", 4500)], 6300);
    expect(totals).toEqual({ tendered: 6300, surchargeSum: 0, balance: 0 });
  });

  it("a card with a 1% fee settles a full bill: gross 6,363, balance 0", () => {
    const { rows, totals } = settleRows([row("card", 6300, { surchargePerc: 1 })], 6300);
    expect(rows[0]).toEqual({ key: "card", base: 6300, surchargeAmt: 63, amount: 6363 });
    expect(totals.tendered).toBe(6363);
    expect(totals.balance).toBe(0);
  });

  it("the flat fee applies only once the row is used", () => {
    expect(settleRows([row("card", 0, { surchargeFlat: 5 })], 100).rows[0].surchargeAmt).toBe(0);
    expect(settleRows([row("card", 50, { surchargeFlat: 5 })], 100).rows[0].surchargeAmt).toBe(5);
  });

  it("F1 fills the shortfall on the current row and does nothing when square", () => {
    expect(fillShortfall(100, -400)).toBe(500);
    expect(fillShortfall(100, 0)).toBe(100);
    expect(fillShortfall(100, 20)).toBe(100);
  });
});

describe("change routing on Save (§15.6)", () => {
  it("the first change-capable row at least the change takes it all", () => {
    const rows = [row("card", 500), cash("cash1", 100), cash("cash2", 1000)];
    const { rows: settled } = settleRows(rows, 1300);
    const routing = routeChange(rows, settled, 300);
    expect(routing.refunds.get("cash2")).toBe(300);
    expect(routing.refunds.has("cash1")).toBe(false);
    expect(routing.unrouted).toBe(0);
  });

  it("never routes change to a row at amount 0 (D3), and reports what nobody can hand back", () => {
    const rows = [cash("cash0", 0), row("card", 1500)];
    const { rows: settled } = settleRows(rows, 1000);
    const routing = routeChange(rows, settled, 500);
    expect(routing.refunds.size).toBe(0);
    expect(routing.unrouted).toBe(500);
  });

  it("settlementOutcome counts TEMP_CR as credit (D5) and clamps the refund at 0", () => {
    const outcome = settlementOutcome([row("tc", 400, { typeCode: "TEMP_CR" }), cash("cash", 600)], 1000);
    expect(outcome.credit).toBe(400);
    expect(outcome.refund).toBe(0);
    expect(outcome.tender).toBe(1000);
    const short = settlementOutcome([cash("cash", 600)], 1000);
    expect(short.refund).toBe(0);
  });
});

describe("set-off is given back before change (§15.5) — the bil00702 case", () => {
  it("bill 1,000 with an advance of 300 set off and cash 1,000 typed → 300 released, change 0", () => {
    const rows = [adj("adv", 300)];
    const settleAmount = 1000 - 300;
    const { totals } = settleRows([cash("cash", 1000)], settleAmount);
    expect(totals.balance).toBe(300);
    const released = releaseAdjustments(rows, Math.min(totals.balance, 300));
    expect(released.released).toBe(300);
    expect(released.rows).toEqual([]);
    // Re-netted: the bill is now settled by the cash alone.
    expect(settleRows([cash("cash", 1000)], 1000).totals.balance).toBe(0);
  });

  it("cash 1,100 → 300 released, change 100", () => {
    const { totals } = settleRows([cash("cash", 1100)], 700);
    expect(totals.balance).toBe(400);
    const released = releaseAdjustments([adj("adv", 300)], Math.min(totals.balance, 300));
    expect(released.released).toBe(300);
    expect(settleRows([cash("cash", 1100)], 1000).totals.balance).toBe(100);
  });

  it("releases NEWEST first", () => {
    const released = releaseAdjustments([adj("old", 200), adj("new", 150)], 100);
    expect(released.rows).toEqual([adj("old", 200), { ...adj("new", 150), amount: 50 }]);
    const more = releaseAdjustments([adj("old", 200), adj("new", 150)], 200);
    expect(more.rows).toEqual([{ ...adj("old", 200), amount: 150 }]);
  });
});

describe("rollups (§15.9)", () => {
  it("with tender lines: paid = counterPaid + adjusted, payMode = the largest line", () => {
    const rollups = rollupsOf({
      bill: 1000,
      totalAdjusted: 300,
      term: "CASH",
      lines: [
        { typeCode: "CASH", base: 500, amount: 500 },
        { typeCode: "CARD", base: 200, amount: 204 },
      ],
      tender: 704,
      credit: 0,
      refund: 0,
      surcharge: 4,
    });
    expect(rollups.counterPaid).toBe(700);
    expect(rollups.paidAmt).toBe(1000);
    expect(rollups.balanceAmt).toBe(0);
    expect(rollups.payStatus).toBe("PAID");
    expect(rollups.payMode).toBe("CASH");
  });

  it("no tender lines, Credit term: the whole balance stays on credit", () => {
    const rollups = rollupsOf({ bill: 1000, totalAdjusted: 300, term: "CREDIT", lines: [], tender: 0, credit: 0, refund: 0, surcharge: 0 });
    expect(rollups.creditAmt).toBe(700);
    expect(rollups.tenderAmt).toBe(0);
    expect(rollups.paidAmt).toBe(300);
    expect(rollups.payStatus).toBe("PARTIAL");
    expect(rollups.payMode).toBe("CREDIT");
  });

  it("no tender lines, Cash term: paid at the counter; ADVANCE when the set-offs cover it", () => {
    const cashRoll = rollupsOf({ bill: 1000, totalAdjusted: 300, term: "CASH", lines: [], tender: 0, credit: 0, refund: 0, surcharge: 0 });
    expect(cashRoll.tenderAmt).toBe(700);
    expect(cashRoll.paidAmt).toBe(1000);
    expect(cashRoll.payMode).toBe("CASH");
    const covered = rollupsOf({ bill: 300, totalAdjusted: 300, term: "CASH", lines: [], tender: 0, credit: 0, refund: 0, surcharge: 0 });
    expect(covered.payMode).toBe("ADVANCE");
    expect(covered.tenderAmt).toBe(0);
  });

  it("the load round-trip: counterPaid(load(save(x))) === counterPaid(x) with advances and notes", () => {
    const saved = rollupsOf({
      bill: 2360,
      totalAdjusted: 500,
      term: "CASH",
      lines: [{ typeCode: "CASH", base: 1860, amount: 1860 }],
      tender: 1860,
      credit: 0,
      refund: 0,
      surcharge: 0,
    });
    expect(saved.paidAmt).toBe(2360);
    expect(counterPaidOnLoad(saved.paidAmt, 300, 200)).toBe(saved.counterPaid);
  });
});

describe("loyalty (§15.7, D4)", () => {
  const member = { memberId: "m1", cardNo: "C9", balance: 120, redeemable: 100, rate: 0.5, minPoints: 50, maxPoints: 1000, maxRedeemAmount: 40, multiple: 10, schemeId: "ls", allowPointRedeem: true };

  it("the scheme rate wins; worth = redeemable × rate; usable above the minimum", () => {
    const facts = loyaltyFacts({ loyalty: member, fallbackPoints: 0, masterRate: 1, masterMinPoints: 100, isWalkIn: false, loyaltyAllowed: true });
    expect(facts.rate).toBe(0.5);
    expect(facts.worth).toBe(50);
    expect(facts.usable).toBe(true);
    expect(facts.hint).toContain("max 40.00 on this bill");
  });

  it("points = amount / rate floored to the multiple, and the amount rewritten; caps refuse and reset", () => {
    const facts = loyaltyFacts({ loyalty: member, fallbackPoints: 0, masterRate: 1, masterMinPoints: 100, isWalkIn: false, loyaltyAllowed: true });
    expect(loyaltyRedeem(27, facts)).toEqual({ amount: 25, points: 50, refused: null });
    expect(loyaltyRedeem(45, facts).refused).toContain("at most 40.00");
    const uncapped = { ...facts, maxRedeemAmount: 0 };
    expect(loyaltyRedeem(80, uncapped).refused).toContain("Only 50.00 of points");
  });

  it("the hints: walk-in · off · not a member · below the minimum", () => {
    expect(loyaltyFacts({ loyalty: member, fallbackPoints: 0, masterRate: 1, masterMinPoints: 0, isWalkIn: true, loyaltyAllowed: true }).hint).toContain("Walk-in");
    expect(loyaltyFacts({ loyalty: member, fallbackPoints: 0, masterRate: 1, masterMinPoints: 0, isWalkIn: false, loyaltyAllowed: false }).hint).toContain("120 points can't be redeemed");
    expect(loyaltyFacts({ loyalty: null, fallbackPoints: 0, masterRate: 1, masterMinPoints: 0, isWalkIn: false, loyaltyAllowed: true }).hint).toContain("not on the loyalty scheme");
    expect(loyaltyFacts({ loyalty: { ...member, redeemable: 10 }, fallbackPoints: 0, masterRate: 1, masterMinPoints: 0, isWalkIn: false, loyaltyAllowed: true }).hint).toContain("at least 50 points");
  });
});

describe("the identity box and the cash-limit line (§15.8)", () => {
  it("PAN is AAAAA9999A, upper-cased", () => {
    expect(isValidPan("abcde1234f")).toBe(true);
    expect(isValidPan("ABCD1234F")).toBe(false);
  });
  it("the cash line hides when both figures are 0", () => {
    expect(cashLimitLine(0, 0)).toBeNull();
    expect(cashLimitLine(150000, 60000)).toBe("Cash today from this party 1,50,000.00 + this bill 60,000.00 = 2,10,000.00");
  });
});

describe("the adjust engine (§14)", () => {
  it("trims FIFO when Σ adjusted exceeds the bill — the oldest is kept", () => {
    const { rows, changed } = clampAdjustmentsToBill([adj("a", 300), adj("b", 200), adj("c", 100)], 420);
    expect(changed).toBe(true);
    expect(rows.map((row) => [row.credit.billId, row.amount])).toEqual([["a", 300], ["b", 120]]);
    expect(clampAdjustmentsToBill([adj("a", 300)], 1000).changed).toBe(false);
  });

  it("Adjust All fills FIFO up to the bill", () => {
    const rows = adjustAll([credit("a", 300), credit("b", 200), credit("c", 100)], 420);
    expect(rows.map((row) => row.amount)).toEqual([300, 120]);
  });

  it("a POSTED bill being amended gets its own set-offs back (§14.2)", () => {
    const merged = mergeHeldCredits(
      [credit("a", 100), credit("z", 50)],
      [
        { againstBillId: "a", againstBillAccYear: "2026-2027", refno: "A", amount: 200, adjType: "ADVANCE_ADJUST" },
        { againstBillId: "spent", againstBillAccYear: "2025-2026", refno: "SR-1", amount: 80, adjType: "NOTE_ADJUST" },
      ],
    );
    expect(merged.find((row) => row.billId === "a")?.pendingAmount).toBe(300);
    const rebuilt = merged.find((row) => row.billId === "spent");
    expect(rebuilt?.billType).toBe("SALES_RETURN");
    expect(rebuilt?.pendingAmount).toBe(80);
    expect(rowsFromHeld([{ againstBillId: "a", againstBillAccYear: "y", refno: "A", amount: 200, adjType: "ADVANCE_ADJUST" }])[0].amount).toBe(200);
  });

  it("absent ≠ empty: authoritative only when the rows came back or nothing was set off", () => {
    expect(adjustmentsAuthoritative(0, 0, 0)).toBe(true);
    expect(adjustmentsAuthoritative(2, 500, 0)).toBe(true);
    expect(adjustmentsAuthoritative(0, 500, 0)).toBe(false);
    expect(adjustmentsAuthoritative(0, 0, 20)).toBe(false);
  });

  it("restoring a held bill reconciles against today's credits, with ONE notice", () => {
    const { rows, notices } = reconcileRestoredAdjustments(
      [adj("a", 300), adj("b", 200), adj("gone", 50)],
      [credit("a", 300), credit("b", 120)],
    );
    expect(rows.map((row) => [row.credit.billId, row.amount])).toEqual([["a", 300], ["b", 120]]);
    expect(notices).toHaveLength(2);
    expect(reconcileNoticeText(notices)).toContain("Some credits changed since this bill was put aside");
    expect(reconcileNoticeText([])).toBeNull();
  });
});
