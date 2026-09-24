import { describe, expect, it } from "vitest";
import type {
  OpeningBillsPayload,
  OpeningListPayload,
  OpeningRowDto,
  Scope,
  TrialBalance,
} from "../opening-balance.types";
import { draftReducer, initialDraft, type OpeningDraft } from "./draft";

const SCOPE: Scope = { companyId: "comp-1", branchId: "branch-1", accYear: "2026-2027" };

const BALANCED: TrialBalance = {
  totalDebit: 0,
  totalCredit: 0,
  difference: 0,
  isBalanced: true,
  unmappedCount: 0,
  differenceLedgerId: null,
  differenceLedgerName: null,
};

function row(partial: Partial<OpeningRowDto>): OpeningRowDto {
  return {
    opId: "op-1",
    ledId: "led-1",
    ledName: "Cash in hand",
    groupName: "Current Assets",
    groupNature: "Assets",
    ledIsBillByBill: false,
    opAmount: 1000,
    opDrCr: "D",
    opSource: "MANUAL",
    opIsStale: false,
    opStaleSince: null,
    opStaleReason: null,
    opRemarks: null,
    priorClosingAmount: null,
    priorClosingDrCr: null,
    billCount: 0,
    ...partial,
  };
}

function loaded(rows: OpeningRowDto[]): OpeningDraft {
  const payload: OpeningListPayload = {
    opCompanyId: SCOPE.companyId,
    opBranchId: SCOPE.branchId,
    opAccYear: SCOPE.accYear,
    rows,
    unclassified: [],
    trialBalance: BALANCED,
  };
  return draftReducer(initialDraft(SCOPE), { type: "LOADED", payload }).draft;
}

describe("loading", () => {
  it("ends the grid in exactly one blank row", () => {
    const draft = loaded([row({}), row({ ledId: "led-2", opId: "op-2" })]);
    expect(draft.rows).toHaveLength(3);
    expect(draft.rows[2].ledId).toBe("");
    expect(draft.dirty).toBe(false);
  });
});

describe("editing", () => {
  it("flips a CARRY_FORWARD row to MANUAL the moment the figure is edited", () => {
    // The server flips it anyway and reports it under flippedToManual. The
    // operator should see what they have done to a derived figure BEFORE saving.
    const draft = loaded([row({ opSource: "CARRY_FORWARD" })]);
    const next = draftReducer(draft, {
      type: "SET_AMOUNT",
      key: draft.rows[0].key,
      amount: 2000,
    }).draft;
    expect(next.rows[0].source).toBe("MANUAL");
    expect(next.dirty).toBe(true);
  });

  it("leaves a MIGRATION row's source alone", () => {
    const draft = loaded([row({ opSource: "MIGRATION" })]);
    const next = draftReducer(draft, {
      type: "SET_AMOUNT",
      key: draft.rows[0].key,
      amount: 5,
    }).draft;
    expect(next.rows[0].source).toBe("MIGRATION");
  });

  it("defaults a side from the prior closing, then falls back to Dr", () => {
    const draft = loaded([
      row({ ledId: "a", opId: null, opAmount: 0, opDrCr: null, priorClosingDrCr: "C" }),
      row({ ledId: "b", opId: null, opAmount: 0, opDrCr: null }),
    ]);
    const withPrior = draftReducer(draft, {
      type: "SET_AMOUNT",
      key: draft.rows[0].key,
      amount: 10,
    }).draft;
    expect(withPrior.rows[0].drCr).toBe("Cr");
    const withoutPrior = draftReducer(withPrior, {
      type: "SET_AMOUNT",
      key: draft.rows[1].key,
      amount: 10,
    }).draft;
    expect(withoutPrior.rows[1].drCr).toBe("Dr");
  });

  it("REFUSES an amount on a bill-wise row, and says why", () => {
    const draft = loaded([row({ ledIsBillByBill: true, ledName: "Acme Traders" })]);
    const result = draftReducer(draft, {
      type: "SET_AMOUNT",
      key: draft.rows[0].key,
      amount: 9999,
    });
    expect(result.draft.rows[0].amount).toBe(1000);
    expect(result.refusal?.message).toContain("Acme Traders");
    expect(result.refusal?.message).toContain("breakup panel");
  });

  it("refuses an amount on the trailing blank row", () => {
    const draft = loaded([row({})]);
    const result = draftReducer(draft, {
      type: "SET_AMOUNT",
      key: draft.rows[1].key,
      amount: 500,
    });
    expect(result.draft.dirty).toBe(false);
    expect(result.refusal?.message).toContain("Pick a ledger");
  });

  it("does not flip the source for a remark — a note is not the figure", () => {
    const draft = loaded([row({ opSource: "CARRY_FORWARD" })]);
    const next = draftReducer(draft, {
      type: "SET_REMARKS",
      key: draft.rows[0].key,
      remarks: "checked against the audited statement",
    }).draft;
    expect(next.rows[0].source).toBe("CARRY_FORWARD");
    expect(next.dirty).toBe(true);
  });
});

describe("picking", () => {
  const LEDGER = {
    ledId: "led-9",
    ledName: "Bank of Baroda",
    groupName: "Bank Accounts",
    groupNature: "Assets",
    isBillWise: false,
  };

  it("fills the trailing row and grows a new one, without going dirty", () => {
    // A pick is not yet an opening: the row carries no figure. The screen goes
    // dirty when a figure or a bill does.
    const draft = loaded([row({})]);
    const next = draftReducer(draft, {
      type: "PICK_LEDGER",
      key: draft.rows[1].key,
      ledger: LEDGER,
    }).draft;
    expect(next.rows).toHaveLength(3);
    expect(next.rows[1].ledName).toBe("Bank of Baroda");
    expect(next.rows[1].source).toBe("MANUAL");
    expect(next.rows[2].ledId).toBe("");
    expect(next.dirty).toBe(false);
  });

  it("refuses a ledger already on the grid, and names its row", () => {
    // ux_op_scope — a ledger opens once per scope per year.
    const draft = loaded([row({ ledId: "led-9", ledName: "Bank of Baroda" })]);
    const result = draftReducer(draft, {
      type: "PICK_LEDGER",
      key: draft.rows[1].key,
      ledger: LEDGER,
    });
    expect(result.refusal?.message).toContain("already row 1");
    expect(result.draft.rows).toHaveLength(2);
  });

  it("opens the breakup when the picked party is bill-wise", () => {
    const draft = loaded([]);
    const next = draftReducer(draft, {
      type: "PICK_LEDGER",
      key: draft.rows[0].key,
      ledger: { ...LEDGER, isBillWise: true },
    }).draft;
    expect(next.currentParty).toBe("led-9");
    expect(next.rows[0].drCr).toBe("");
  });
});

describe("removing", () => {
  it("refuses a bill-wise party that still has bills", () => {
    const draft = loaded([
      row({ ledIsBillByBill: true, billCount: 9, ledName: "Acme Traders" }),
    ]);
    const result = draftReducer(draft, { type: "REMOVE_ROW", key: draft.rows[0].key });
    expect(result.draft.rows).toHaveLength(2);
    expect(result.refusal?.message).toContain("9 opening bill(s)");
  });

  it("never removes the trailing blank row", () => {
    const draft = loaded([row({})]);
    const next = draftReducer(draft, { type: "REMOVE_ROW", key: draft.rows[1].key }).draft;
    expect(next.rows).toHaveLength(2);
  });

  it("removes an ordinary row and closes its panel", () => {
    const draft = {
      ...loaded([row({})]),
      currentParty: "led-1",
    };
    const next = draftReducer(draft, { type: "REMOVE_ROW", key: draft.rows[0].key }).draft;
    expect(next.rows).toHaveLength(1);
    expect(next.currentParty).toBeNull();
    expect(next.dirty).toBe(true);
  });
});

describe("bills", () => {
  function billsPayload(partial: Partial<OpeningBillsPayload> = {}): OpeningBillsPayload {
    return {
      companyId: SCOPE.companyId,
      branchId: "branch-1",
      accYear: SCOPE.accYear,
      partyId: "led-1",
      partyName: "Acme Traders",
      opId: "op-1",
      bills: [
        {
          ablId: "abl-1",
          ablDocRefno: "INV/1",
          ablDocDate: "2026-01-12",
          ablDueDate: null,
          ablCreditDays: 0,
          ablGraceDays: 0,
          ablDrCr: "DR",
          ablBillAmount: 5000,
          ablAllocAmount: 0,
          ablDiscAmount: 0,
          ablWriteoffAmount: 0,
          ablPendingAmount: 5000,
          ablStatus: "OPEN",
          ablNarration: null,
          isFrozen: false,
        },
      ],
      billTotalAmount: 5000,
      billTotalDrCr: "D",
      openingAmount: 5000,
      openingDrCr: "D",
      isTied: true,
      ...partial,
    };
  }

  it("mirrors the party's net onto its ledger row as the bills arrive", () => {
    const draft = loaded([row({ ledIsBillByBill: true, opAmount: 0, opDrCr: null })]);
    const next = draftReducer(draft, {
      type: "BILLS_LOADED",
      partyId: "led-1",
      payload: billsPayload(),
    }).draft;
    expect(next.rows[0].amount).toBe(5000);
    expect(next.rows[0].drCr).toBe("Dr");
    expect(next.billsByParty["led-1"]).toHaveLength(2); // + the trailing blank
  });

  it("re-mirrors on every edit, so the tie is true before the save makes it so", () => {
    let draft = loaded([row({ ledIsBillByBill: true, opAmount: 0, opDrCr: null })]);
    draft = draftReducer(draft, {
      type: "BILLS_LOADED",
      partyId: "led-1",
      payload: billsPayload(),
    }).draft;
    const blank = draft.billsByParty["led-1"][1];
    draft = draftReducer(draft, {
      type: "SET_BILL_FIELD",
      partyId: "led-1",
      key: blank.key,
      patch: { docRefno: "CN/7", drCr: "Cr", amount: 3000 },
    }).draft;
    // 5,000 Dr against 3,000 Cr opens the party at 2,000 Dr.
    expect(draft.rows[0].amount).toBe(2000);
    expect(draft.rows[0].drCr).toBe("Dr");
    expect(draft.dirtyParties).toEqual(["led-1"]);
    expect(draft.dirty).toBe(true);
  });

  it("refuses to delete a receipted bill", () => {
    let draft = loaded([row({ ledIsBillByBill: true })]);
    draft = draftReducer(draft, {
      type: "BILLS_LOADED",
      partyId: "led-1",
      payload: billsPayload({
        bills: [{ ...billsPayload().bills[0], isFrozen: true }],
      }),
    }).draft;
    const result = draftReducer(draft, {
      type: "REMOVE_BILL",
      partyId: "led-1",
      key: draft.billsByParty["led-1"][0].key,
    });
    expect(result.refusal?.message).toContain("receipted against");
    expect(result.draft.billsByParty["led-1"]).toHaveLength(2);
  });

  it("keeps a breakup while another party is on screen", () => {
    // Edit A, click B, save — A must still be saved.
    let draft = loaded([
      row({ ledId: "a", ledIsBillByBill: true }),
      row({ ledId: "b", opId: "op-2", ledIsBillByBill: true }),
    ]);
    draft = draftReducer(draft, {
      type: "BILLS_LOADED",
      partyId: "a",
      payload: billsPayload({ partyId: "a" }),
    }).draft;
    draft = draftReducer(draft, {
      type: "SET_BILL_FIELD",
      partyId: "a",
      key: draft.billsByParty.a[0].key,
      patch: { amount: 7000 },
    }).draft;
    draft = draftReducer(draft, { type: "SELECT_PARTY", partyId: "b" }).draft;
    expect(draft.billsByParty.a[0].amount).toBe(7000);
    expect(draft.dirtyParties).toEqual(["a"]);
  });

  it("does not let a refetch overwrite unsaved work on that party", () => {
    let draft = loaded([row({ ledIsBillByBill: true })]);
    draft = draftReducer(draft, {
      type: "BILLS_LOADED",
      partyId: "led-1",
      payload: billsPayload(),
    }).draft;
    draft = draftReducer(draft, {
      type: "SET_BILL_FIELD",
      partyId: "led-1",
      key: draft.billsByParty["led-1"][0].key,
      patch: { amount: 8888 },
    }).draft;
    draft = draftReducer(draft, {
      type: "BILLS_LOADED",
      partyId: "led-1",
      payload: billsPayload(),
    }).draft;
    expect(draft.billsByParty["led-1"][0].amount).toBe(8888);
  });
});

describe("scope changes", () => {
  it("throws every cached breakup away — the other set shares nothing", () => {
    let draft = loaded([row({ ledIsBillByBill: true })]);
    draft = draftReducer(draft, {
      type: "SELECT_PARTY",
      partyId: "led-1",
    }).draft;
    const next = draftReducer(draft, {
      type: "SCOPE_CHANGED",
      scope: { ...SCOPE, branchId: null },
    }).draft;
    expect(next.billsByParty).toEqual({});
    expect(next.currentParty).toBeNull();
    expect(next.loaded).toBe(false);
    expect(next.scope.branchId).toBeNull();
  });
});

describe("saving", () => {
  it("stays dirty when one party's bills were refused", () => {
    let draft = loaded([
      row({ ledId: "a", ledIsBillByBill: true }),
      row({ ledId: "b", opId: "op-2", ledIsBillByBill: true }),
    ]);
    draft = { ...draft, dirtyParties: ["a", "b"], dirty: true };
    const next = draftReducer(draft, {
      type: "SAVED",
      trialBalance: BALANCED,
      savedParties: ["a"],
    }).draft;
    expect(next.dirtyParties).toEqual(["b"]);
    expect(next.dirty).toBe(true);
  });

  it("goes clean when everything went through", () => {
    let draft = loaded([row({})]);
    draft = { ...draft, dirtyParties: ["a"], dirty: true };
    const next = draftReducer(draft, {
      type: "SAVED",
      trialBalance: BALANCED,
      savedParties: ["a"],
    }).draft;
    expect(next.dirty).toBe(false);
    expect(next.dirtyParties).toEqual([]);
  });
});
