import { describe, expect, it } from "vitest";
import { expenseDraftReducer, newDraft, reenterCopy } from "./draft";
import { CASH_ID, COMPANY, OTHER, SCOPE, TODAY } from "./fixtures";
import { expenseMemoryScope, isExpenseWorthRemembering, movedFromScope, type ExpenseMemory } from "./memory";

const typedNew = expenseDraftReducer(newDraft(TODAY, CASH_ID), {
  type: "SET_HEADER",
  patch: { paidTo: "Courier boy" },
});

function memoryOf(typed: ExpenseMemory["typed"]): ExpenseMemory {
  return { typed, autoGstin: "", scope: expenseMemoryScope(typed, SCOPE) };
}

describe("which expense voucher is worth bringing back", () => {
  it("keeps a NEW voucher once something is typed, not a blank one", () => {
    expect(isExpenseWorthRemembering(memoryOf(newDraft(TODAY, CASH_ID)))).toBe(false);
    expect(isExpenseWorthRemembering(memoryOf(typedNew))).toBe(true);
  });

  it("keeps an edited DRAFT, not one opened and left untouched", () => {
    const keys = { ...SCOPE, voucherId: "v-1" };
    const opened = { ...newDraft(TODAY), keys, status: "DRAFT" as const };
    expect(isExpenseWorthRemembering(memoryOf(opened))).toBe(false);
    expect(isExpenseWorthRemembering(memoryOf({ ...opened, dirty: true }))).toBe(true);
  });

  it("never keeps a POSTED or CANCELLED voucher", () => {
    const keys = { ...SCOPE, voucherId: "v-1" };
    expect(isExpenseWorthRemembering(memoryOf({ ...typedNew, keys, status: "POSTED" }))).toBe(false);
    expect(isExpenseWorthRemembering(memoryOf({ ...typedNew, keys, status: "CANCELLED" }))).toBe(false);
  });

  it("keeps the copy Cancel & re-enter opened", () => {
    const posted = { ...typedNew, keys: { ...SCOPE, voucherId: "v-1" }, status: "POSTED" as const, dirty: false };
    expect(isExpenseWorthRemembering(memoryOf(reenterCopy(posted, TODAY, new Map())))).toBe(true);
  });
});

describe("the tenant a remembered voucher belongs to", () => {
  it("is the header's for a NEW voucher, the voucher's own keys once saved", () => {
    expect(expenseMemoryScope(typedNew, SCOPE)).toEqual(SCOPE);
    const keys = { companyId: OTHER, branchId: "b-2", accYear: "2025-2026", voucherId: "v-1" };
    expect(expenseMemoryScope({ ...typedNew, keys, status: "DRAFT" }, SCOPE)).toEqual({
      companyId: OTHER,
      branchId: "b-2",
      accYear: "2025-2026",
    });
  });

  it("names the old slot only when the header moved the voucher", () => {
    expect(movedFromScope(null, SCOPE)).toBeNull();
    expect(movedFromScope({ ...SCOPE }, SCOPE)).toBeNull();
    const moved = { ...SCOPE, companyId: OTHER };
    expect(movedFromScope(SCOPE, moved)).toEqual(SCOPE);
    expect(movedFromScope({ ...SCOPE, accYear: "2025-2026" }, { ...SCOPE, companyId: COMPANY })).toEqual({
      ...SCOPE,
      accYear: "2025-2026",
    });
  });
});
