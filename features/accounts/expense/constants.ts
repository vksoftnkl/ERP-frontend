/**
 * Expense Voucher — where it lives.
 *
 * Menu 277 "Expense Voucher" under 5 "Accounts" (DB label "&5 Accounts"),
 * `fixed.menu_master` row from the server migration 20261008160000. The route
 * is bound to menu 277 in `MENU_ROUTES`, which makes it menu-governed; the
 * server's own menu-277 rights (`EXP_RIGHT_<VERB>`) gate it as well.
 */
import type { ExpenseKeys } from "./expense.types";

export const EXPENSE_MENU_ID = 277;
export const EXPENSE_ROUTE = "/accounts/expense-voucher";

/** One voucher's own address: `/accounts/expense-voucher/:company/:branch/:year/:id`. */
export function expenseVoucherHref(keys: ExpenseKeys): string {
  return [EXPENSE_ROUTE, keys.companyId, keys.branchId, keys.accYear, keys.voucherId]
    .map((part, index) => (index === 0 ? part : encodeURIComponent(part)))
    .join("/");
}
