"use client";
/**
 * Sale Orders — the route. Same two-view shape as the quotation's: the menu
 * lands on the list, Create/View/Edit hand off to the voucher form on the same
 * route (an order is identified by four fields, not one id — nothing in the
 * URL is worth deep-linking to).
 *
 * An order left half-entered when the operator went to another screen is kept
 * in screen memory (lib/screen-memory), and the route then reopens ON it
 * instead of on the list — the Qt MDI window that was simply still there.
 */
import { useCallback, useMemo, useState } from "react";
import { resumeFromScreenMemory, SALE_ORDER_MEMORY_KEY } from "@/features/sales/document-memory";
import { useAppStore } from "@/store/hooks";
import { selectSaleOrderDraft } from "@/store/slices/saleOrderSlice";
import { SaleOrderEntryView } from "./components/sale-order-entry-view";
import { SaleOrderListView } from "./components/sale-order-list-view";
import type { SaleOrderDocKey } from "./sale-order.types";
import { useSaleOrderDraftScope } from "./use-sale-order-draft";

type View =
  | { screen: "list" }
  | {
      screen: "entry";
      document?: SaleOrderDocKey;
      mode: "browse" | "entry";
      /** Reopened on the remembered order, not on an explicit Create / Open. */
      resume?: boolean;
    };

export default function SaleOrdersPage() {
  const store = useAppStore();
  const scope = useSaleOrderDraftScope();
  const [view, setView] = useState<View>(() =>
    resumeFromScreenMemory(selectSaleOrderDraft(store.getState()), SALE_ORDER_MEMORY_KEY, scope)
      ? { screen: "entry", mode: "entry", resume: true }
      : { screen: "list" },
  );

  const onOpen = useCallback((document: SaleOrderDocKey, mode: "browse" | "entry") => {
    setView({ screen: "entry", document, mode });
  }, []);
  const onCreate = useCallback(() => {
    setView({ screen: "entry", mode: "entry" });
  }, []);
  const onBackToList = useCallback(() => {
    setView({ screen: "list" });
  }, []);

  const resume = view.screen === "entry" && Boolean(view.resume);
  const memory = useMemo(() => ({ key: SALE_ORDER_MEMORY_KEY, resume }), [resume]);

  return view.screen === "list" ? (
    <SaleOrderListView onCreate={onCreate} onOpen={onOpen} />
  ) : (
    <SaleOrderEntryView
      initialDocument={view.document}
      initialMode={view.mode}
      onBackToList={onBackToList}
      memory={memory}
    />
  );
}
