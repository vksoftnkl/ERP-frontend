"use client";

/**
 * Receipts — the route.
 *
 * Two views on one page, as the quotation and the sale order have: the menu
 * lands on the REGISTER, and Add / Edit / Enter hand off to the voucher in
 * place. The voucher also has a URL of its own —
 * `/accounts/receipt/:company/:branch/:year/:id` — for the drill-through from
 * the cheque register and for anything that wants to link to one receipt; this
 * page is what the menu points at.
 */
import { useCallback, useState } from "react";
import ReceiptScreen from "./receipt-screen";
import { ReceiptListView } from "./components/receipt-list-view";
import type { ReceiptKeys } from "./receipt.types";

type View = { screen: "list" } | { screen: "entry"; keys?: ReceiptKeys };

export default function ReceiptPage() {
  const [view, setView] = useState<View>({ screen: "list" });

  const onOpen = useCallback((keys: ReceiptKeys) => {
    setView({ screen: "entry", keys });
  }, []);
  const onCreate = useCallback(() => {
    setView({ screen: "entry" });
  }, []);
  const onBackToList = useCallback(() => {
    setView({ screen: "list" });
  }, []);

  return view.screen === "list" ? (
    <ReceiptListView onCreate={onCreate} onOpen={onOpen} />
  ) : (
    <ReceiptScreen
      // Keyed on the document, so picking a different receipt from the
      // register starts the screen over rather than leaving it on the last
      // one's state — the open-by-keys effect runs once per mount.
      key={view.keys?.avhVoucherId ?? "new"}
      initialKeys={view.keys}
      onBackToList={onBackToList}
    />
  );
}
