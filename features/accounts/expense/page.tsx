"use client";

/**
 * Expense Vouchers — the route (menu 277).
 *
 * Qt opens the menu on `TxnMainView` (list → entry); here the two views share
 * one page: the menu lands on the REGISTER, and New / Edit / Enter hand off to
 * the voucher in place, as the receipt and the payment do. One voucher also
 * has a URL of its own — `/accounts/expense-voucher/:company/:branch/:year/:id`.
 *
 * A voucher left half-entered when the operator went to another screen is kept
 * in screen memory (lib/screen-memory), and the route then reopens ON it
 * instead of on the register.
 */
import { useCallback, useMemo, useState } from "react";
import { screenMemory } from "@/lib/screen-memory";
import ExpenseScreen from "./expense-screen";
import { ExpenseListView } from "./components/expense-list-view";
import { EXPENSE_MEMORY_KEY } from "./domain/memory";
import type { ExpenseKeys } from "./expense.types";
import { useExpenseScope } from "./state/use-expense-voucher";

type View =
  | { screen: "list" }
  | {
      screen: "entry";
      keys?: ExpenseKeys;
      seq: number;
      /** Reopened on the remembered voucher, not on an explicit New / Open. */
      resume?: boolean;
    };

const RESUME_VIEW: View = { screen: "entry", seq: 0, resume: true };

export default function ExpensePage() {
  const scope = useExpenseScope();
  const [view, setView] = useState<View>(() =>
    screenMemory.has(EXPENSE_MEMORY_KEY, scope) ? RESUME_VIEW : { screen: "list" },
  );
  // The header's tenant can still be resolving on the first render, and a
  // header switch back to the tenant a voucher was left in brings it into
  // reach. Until the operator does something here, a remembered voucher that
  // turns up is reopened — otherwise the next New would write over it.
  // Adjusted while rendering, when the tenant changes, not one render late.
  const [operatorActed, setOperatorActed] = useState(false);
  const [scopeSeen, setScopeSeen] = useState(scope);
  if (scopeSeen !== scope) {
    setScopeSeen(scope);
    if (!operatorActed && view.screen === "list" && screenMemory.has(EXPENSE_MEMORY_KEY, scope)) {
      setView(RESUME_VIEW);
    }
  }

  const onOpen = useCallback((keys: ExpenseKeys) => {
    setOperatorActed(true);
    setView({ screen: "entry", keys, seq: Date.now() });
  }, []);
  const onCreate = useCallback(() => {
    setOperatorActed(true);
    setView({ screen: "entry", seq: Date.now() });
  }, []);
  const onBackToList = useCallback(() => {
    setOperatorActed(true);
    setView({ screen: "list" });
  }, []);

  const resume = view.screen === "entry" && Boolean(view.resume);
  const memory = useMemo(() => ({ key: EXPENSE_MEMORY_KEY, resume }), [resume]);

  return view.screen === "list" ? (
    <ExpenseListView onCreate={onCreate} onOpen={onOpen} />
  ) : (
    <ExpenseScreen
      // Keyed on the document: the open-by-keys read runs once per mount, and
      // a resume is a mount of its own.
      key={view.resume ? "resume" : view.keys?.voucherId ?? `new-${view.seq}`}
      initialKeys={view.keys}
      onBackToList={onBackToList}
      memory={memory}
    />
  );
}
