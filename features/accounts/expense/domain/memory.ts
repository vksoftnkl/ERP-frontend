/**
 * Screen memory (lib/screen-memory) for the expense voucher: what is kept when
 * the operator leaves the screen for another menu, and under which tenant.
 *
 * Kept: a voucher that can still change and has something typed into it — a
 * NEW one, an edited DRAFT, the copy Cancel & re-enter opened. Not kept: a
 * blank voucher, a draft opened and left untouched (it reopens from F8), a
 * POSTED or CANCELLED one, and the screen a save or post just cleared.
 *
 * The answer to the server's check is not kept: it is asked again for the
 * restored body. Nor is the till session — it is read live.
 */
import type { ScreenScope } from "@/lib/screen-memory";
import type { ExpenseDraft, ExpenseScope } from "../expense.types";
import { isEditable } from "./draft";

export const EXPENSE_MEMORY_KEY = "accounts/expense-voucher";

export type ExpenseMemory = {
  typed: ExpenseDraft;
  /** The GSTIN last filled from the party ledger (Qt `m_autoGstin`). */
  autoGstin: string;
  /** The tenant the voucher is written to — see `expenseMemoryScope`. */
  scope: ScreenScope;
};

/**
 * A saved voucher keeps the tenant it was written with; a NEW one is written
 * where the header points, so it follows the header.
 */
export function expenseMemoryScope(typed: ExpenseDraft, header: ExpenseScope): ScreenScope {
  const keys = typed.keys;
  return keys
    ? { companyId: keys.companyId, branchId: keys.branchId, accYear: keys.accYear }
    : { companyId: header.companyId, branchId: header.branchId, accYear: header.accYear };
}

export function isExpenseWorthRemembering(memory: ExpenseMemory): boolean {
  return memory.typed.dirty && isEditable(memory.typed.status);
}

/**
 * The slot a NEW voucher was remembered in before the header moved it, or null
 * when it has not moved — that slot must be dropped, or the voucher would come
 * back in both tenants.
 */
export function movedFromScope(previous: ScreenScope | null, next: ScreenScope): ScreenScope | null {
  if (!previous) {
    return null;
  }
  const same =
    previous.companyId === next.companyId &&
    previous.branchId === next.branchId &&
    previous.accYear === next.accYear;
  return same ? null : previous;
}
