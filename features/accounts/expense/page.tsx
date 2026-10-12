"use client";

/**
 * Expense Vouchers — the route (menu 277).
 *
 * Qt opens the menu on `TxnMainView` (list → entry); here the two views share
 * one page: the menu lands on the REGISTER, and New / Edit / Enter hand off to
 * the voucher in place, as the receipt and the payment do. One voucher also
 * has a URL of its own — `/accounts/expense-voucher/:company/:branch/:year/:id`.
 */
import { useCallback, useState } from "react";
import ExpenseScreen from "./expense-screen";
import { ExpenseListView } from "./components/expense-list-view";
import type { ExpenseKeys } from "./expense.types";

type View = { screen: "list" } | { screen: "entry"; keys?: ExpenseKeys; seq: number };

export default function ExpensePage() {
  const [view, setView] = useState<View>({ screen: "list" });

  const onOpen = useCallback((keys: ExpenseKeys) => {
    setView({ screen: "entry", keys, seq: Date.now() });
  }, []);
  const onCreate = useCallback(() => {
    setView({ screen: "entry", seq: Date.now() });
  }, []);
  const onBackToList = useCallback(() => {
    setView({ screen: "list" });
  }, []);

  return view.screen === "list" ? (
    <ExpenseListView onCreate={onCreate} onOpen={onOpen} />
  ) : (
    <ExpenseScreen
      // Keyed on the document: the open-by-keys read runs once per mount.
      key={view.keys?.voucherId ?? `new-${view.seq}`}
      initialKeys={view.keys}
      onBackToList={onBackToList}
    />
  );
}
