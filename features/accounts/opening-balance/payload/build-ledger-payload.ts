/**
 * `POST /opening-balances/create` — the whole ledger set in one body.
 *
 * Four omission rules, three on the rows and one on the envelope. Each of them
 * is load-bearing:
 *
 *  1. **A bill-wise row is omitted.** `/create` refuses one even at amount 0
 *     ("…is a bill-by-bill party — enter its opening as bills in the breakup
 *     panel…"), and `replace:true` does not lose it: the server reports it back
 *     under `retainedWithBills`. `POST /bills` owns that party's `op_amount`.
 *  2. **A row with no ledger is omitted.** That is the trailing picker row.
 *  3. **A zero row is omitted. ABSENCE IS THE ZERO.** Sending 0 earns a
 *     `skippedZero` and leaves the old row standing; omitting it under
 *     `replace:true` is what CLEARS it. This is why `DELETE /delete` is not
 *     wired into this feature at all.
 *  4. **`opBranchId` is an explicit `null` for the company-level set.** An
 *     omitted key is a different request. `JSON.stringify` keeps a null, but an
 *     "omit empty" helper anywhere in the path would not — hence the test that
 *     asserts the key is present in the serialised body.
 *
 * `replace: true` is always sent, and `opSource` is ECHOED, never asserted: it
 * is the server's column, and sending CARRY_FORWARD onto a MIGRATION row does
 * nothing at all.
 */
import { toPaise } from "../derived";
import type {
  LedgerRow,
  SaveOpeningBalance,
  SaveOpeningBalanceRow,
  Scope,
} from "../opening-balance.types";
import { toLedgerWire } from "../wire/side";

/**
 * Whether a row is one `/create` carries. Exported so the screen can count what
 * a save will actually send without rebuilding the body.
 */
export function isSendableLedgerRow(row: LedgerRow): boolean {
  return row.ledId !== "" && !row.isBillWise && toPaise(row.amount) !== 0;
}

/**
 * How `opRemarks` is sent.
 *
 * The plan says "trimmed, omitted when empty". That is right for a row that
 * never had a remark, but on the UPDATE path the server passes an omitted key
 * through untouched — so an operator who CLEARS a remark would find it back
 * after the reload. A row that arrived carrying one and is now empty therefore
 * sends an explicit `null`, which is the only value that clears it. A row that
 * arrived empty and is still empty sends nothing.
 */
function remarksField(row: LedgerRow): { opRemarks?: string | null } {
  const remarks = row.remarks.trim();
  if (remarks !== "") {
    return { opRemarks: remarks };
  }
  return row.loadedRemarks.trim() !== "" ? { opRemarks: null } : {};
}

export function buildLedgerRow(row: LedgerRow): SaveOpeningBalanceRow {
  return {
    ...(row.opId ? { opId: row.opId } : {}),
    opLedgerId: row.ledId,
    opAmount: row.amount,
    // A row carrying a figure always has a side by the time it gets here; `D`
    // is what an asset opens on and what the reducer defaults to.
    opDrCr: toLedgerWire(row.drCr) ?? "D",
    ...(row.source ? { opSource: row.source } : {}),
    ...remarksField(row),
  };
}

export function buildLedgerPayload(
  scope: Scope,
  rows: readonly LedgerRow[],
): SaveOpeningBalance {
  return {
    opCompanyId: scope.companyId,
    opAccYear: scope.accYear,
    // Rule 4. Never `?? undefined`, never dropped by a spread.
    opBranchId: scope.branchId,
    rows: rows.filter(isSendableLedgerRow).map(buildLedgerRow),
    replace: true,
  };
}
