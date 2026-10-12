/**
 * ════════════════════════════════════════════════════════════════════════
 *  TILL-SESSION INTEGRATION POINT — the ONE place the expense voucher asks
 *  "is this device in a till session?"
 * ════════════════════════════════════════════════════════════════════════
 *
 * Qt reads `AppSession::instance().tillSession()` (set by Open Till Session on
 * an open or a resume) in three places, and this screen does the same three
 * things with what this hook returns:
 *
 *   1. `sessionId` goes on the `/expenses/create` and `/validate` body
 *      (`SaveExpenseDto.sessionId`). Advisory: the server routes the cash by
 *      the DEVICE's live session whatever is sent (`routeMoneyDoc`), so a
 *      missing id never misroutes money — it only leaves the draft unstamped
 *      until post.
 *   2. The voucher date is locked (Qt `refreshState`): at the till the
 *      drawer's money moved on the business day, never on another date.
 *   3. The money-from strip names the session ("Till session C01-261009-01 —
 *      cash comes out of this drawer").
 *
 * The session is the one Open Till (menu 272) holds for this tab
 * (`features/sales/till/shared/session-store.ts`). It counts only for the
 * company and branch the screen is working in: a session opened under another
 * branch is not this voucher's drawer, so the screen then behaves as Qt does
 * on a back-office device (date editable; the server still says DRAWER / SAFE
 * / LEDGER per tender in `/validate`).
 */
import { useMemo } from "react";
import { useBusinessContext } from "@/components/layout/business-context";
import { useTillSession } from "@/features/sales/till/shared/use-till-session";
import type { ExpenseTillSession } from "./expense.types";

export function useExpenseTillSession(): ExpenseTillSession | null {
  const live = useTillSession();
  const { activeCompany, activeBranch } = useBusinessContext();
  const id = live?.id ?? "";
  const sessionNo = live?.sessionNo ?? "";
  const inScope = Boolean(
    live && id && live.companyId === (activeCompany?.id ?? "") && live.branchId === (activeBranch?.id ?? ""),
  );
  // One object per session, so effects keyed on it do not re-run every render.
  return useMemo(() => (inScope ? { sessionId: id, sessionNo } : null), [id, inScope, sessionNo]);
}
