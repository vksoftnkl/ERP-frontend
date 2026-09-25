import { describe, expect, it } from "vitest";
import { createDraftChargeRow } from "@/features/sales/quotation/quotation.state";
import {
  applyCarryProposals,
  carriedRows,
  carryAfterAmountEdit,
  carryFromOrderCharge,
  fullCarryAmount,
  setCarryBasis,
} from "./carry";
import type { BillChargeRow, ChargeCarryProposal } from "../types";

function row(overrides: Partial<BillChargeRow> = {}): BillChargeRow {
  return { ...createDraftChargeRow({ chgId: "chg-1", chgName: "Freight", ledgerCode: "L1", rate: 10, amount: 0 }), ...overrides };
}

const proposal: ChargeCarryProposal = {
  cdSrcCdId: "cd-order-1",
  cdSrcAccYear: "2026-2027",
  chgName: "Freight",
  orderAmount: 500,
  carriedSoFar: 200,
  proposed: 150,
  basis: "PRORATA",
  isFinalBill: false,
};

describe("carry facts (§12.4)", () => {
  it("stamps the order's charge id, year, PRORATA and the order amount", () => {
    const carry = carryFromOrderCharge({ cdId: "cd-order-1", cdAmount: 500 }, "2026-2027");
    expect(carry).toMatchObject({ srcCdId: "cd-order-1", srcAccYear: "2026-2027", basis: "PRORATA", orderAmount: 500, carriedSoFar: 0 });
  });

  it("FULL is what is left after the earlier bills", () => {
    const carry = { ...carryFromOrderCharge({ cdId: "x", cdAmount: 500 }, "y"), carriedSoFar: 480 };
    expect(fullCarryAmount(carry)).toBe(20);
    expect(fullCarryAmount({ ...carry, carriedSoFar: 600 })).toBe(0);
  });

  it("applies a proposal to a PRORATA row: amount = proposed, rate = 0", () => {
    const rows = [row({ carry: carryFromOrderCharge({ cdId: "cd-order-1", cdAmount: 500 }, "2026-2027") })];
    const result = applyCarryProposals(rows, [proposal]);
    expect(result.changed).toBe(true);
    expect(result.rows[0].amount).toBe(150);
    expect(result.rows[0].rate).toBe(0);
    expect(result.rows[0].carry).toMatchObject({ carriedSoFar: 200, proposed: 150, orderAmount: 500 });
  });

  it("leaves a MANUAL or NONE row's amount alone but refreshes its facts", () => {
    const manual = row({ amount: 99, rate: 0, carry: { ...carryFromOrderCharge({ cdId: "cd-order-1", cdAmount: 500 }, "2026-2027"), basis: "MANUAL" } });
    const result = applyCarryProposals([manual], [proposal]);
    expect(result.rows[0].amount).toBe(99);
    expect(result.rows[0].carry?.carriedSoFar).toBe(200);
  });

  it("ignores rows without carry facts and proposals for other charges", () => {
    const plain = row();
    const other = row({ key: "k2", carry: carryFromOrderCharge({ cdId: "cd-other", cdAmount: 10 }, "2026-2027") });
    const result = applyCarryProposals([plain, other], [proposal]);
    expect(result.changed).toBe(false);
    expect(result.rows).toBe([plain, other].length === 2 ? result.rows : []);
    expect(result.rows[0].carry).toBeUndefined();
    expect(result.rows[1].amount).toBe(0);
  });

  it("does not move a row already within 0.005 of the proposal", () => {
    const rows = [row({ amount: 150, rate: 0, carry: { ...carryFromOrderCharge({ cdId: "cd-order-1", cdAmount: 500 }, "2026-2027"), carriedSoFar: 200, proposed: 150 } })];
    expect(applyCarryProposals(rows, [proposal]).changed).toBe(false);
  });

  it("the basis menu: FULL takes the remainder, NONE takes 0, MANUAL leaves the amount", () => {
    const base = row({ amount: 150, rate: 0, carry: { ...carryFromOrderCharge({ cdId: "x", cdAmount: 500 }, "y"), carriedSoFar: 200, proposed: 150 } });
    expect(setCarryBasis(base, "FULL").amount).toBe(300);
    expect(setCarryBasis(base, "NONE").amount).toBe(0);
    expect(setCarryBasis(base, "MANUAL").amount).toBe(150);
    expect(setCarryBasis(base, "MANUAL").carry?.basis).toBe("MANUAL");
    expect(setCarryBasis(setCarryBasis(base, "NONE"), "PRORATA").amount).toBe(150);
  });

  it("an Amount edit makes a carried row MANUAL, and leaves a plain row alone", () => {
    const carried = row({ carry: carryFromOrderCharge({ cdId: "x", cdAmount: 500 }, "y") });
    expect(carryAfterAmountEdit(carried).carry?.basis).toBe("MANUAL");
    const plain = row();
    expect(carryAfterAmountEdit(plain)).toBe(plain);
  });

  it("carriedRows lists only real rows with carry facts", () => {
    const rows = [row(), row({ key: "k2", carry: carryFromOrderCharge({ cdId: "x", cdAmount: 1 }, "y") }), row({ key: "k3", chgId: "", carry: carryFromOrderCharge({ cdId: "z", cdAmount: 1 }, "y") })];
    expect(carriedRows(rows).map((r) => r.key)).toEqual(["k2"]);
  });
});
