"use client";
/**
 * Sale Orders — the route. Same two-view shape as the quotation's: the menu
 * lands on the list, Create/View/Edit hand off to the voucher form on the same
 * route (an order is identified by four fields, not one id — nothing in the
 * URL is worth deep-linking to).
 */
import { useCallback, useState } from "react";
import { SaleOrderEntryView } from "./components/sale-order-entry-view";
import { SaleOrderListView } from "./components/sale-order-list-view";
import type { SaleOrderDocKey } from "./sale-order.types";

type View =
  | { screen: "list" }
  | { screen: "entry"; document?: SaleOrderDocKey; mode: "browse" | "entry" };

export default function SaleOrdersPage() {
  const [view, setView] = useState<View>({ screen: "list" });

  const onOpen = useCallback((document: SaleOrderDocKey, mode: "browse" | "entry") => {
    setView({ screen: "entry", document, mode });
  }, []);
  const onCreate = useCallback(() => {
    setView({ screen: "entry", mode: "entry" });
  }, []);
  const onBackToList = useCallback(() => {
    setView({ screen: "list" });
  }, []);

  return view.screen === "list" ? (
    <SaleOrderListView onCreate={onCreate} onOpen={onOpen} />
  ) : (
    <SaleOrderEntryView
      initialDocument={view.document}
      initialMode={view.mode}
      onBackToList={onBackToList}
    />
  );
}
