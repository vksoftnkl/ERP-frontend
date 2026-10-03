"use client";

/**
 * Payments — the route.
 *
 * The receipt's two views on one page: the menu lands on the REGISTER, and
 * Add / Edit / Enter hand off to the voucher in place. One payment also has a
 * URL of its own — `/accounts/payment/:company/:branch/:year/:id` — for the
 * drill-through from the issued-cheque register and anything that links to
 * one payment.
 */
import { useCallback, useState } from "react";
import PaymentScreen from "./payment-screen";
import { PaymentListView } from "./components/payment-list-view";
import type { PaymentKeys } from "./payment.types";

type View = { screen: "list" } | { screen: "entry"; keys?: PaymentKeys };

export default function PaymentPage() {
  const [view, setView] = useState<View>({ screen: "list" });

  const onOpen = useCallback((keys: PaymentKeys) => {
    setView({ screen: "entry", keys });
  }, []);
  const onCreate = useCallback(() => {
    setView({ screen: "entry" });
  }, []);
  const onBackToList = useCallback(() => {
    setView({ screen: "list" });
  }, []);

  return view.screen === "list" ? (
    <PaymentListView onCreate={onCreate} onOpen={onOpen} />
  ) : (
    <PaymentScreen
      // Keyed on the document: the open-by-keys effect runs once per mount.
      key={view.keys?.avhVoucherId ?? "new"}
      initialKeys={view.keys}
      onBackToList={onBackToList}
    />
  );
}
