"use client";
/**
 * Stock Adjustment (menu 264) — the route. The Sale Order's two-view shape:
 * the list (grid 122) and the voucher on the same route; a document is
 * identified by four fields, so nothing in the URL is worth deep-linking to.
 *
 * Which one the menu lands on is `system.txn_entry_first` — the Qt
 * `TxnMainView::openForMenu` switch: false (the default) is LIST FIRST, back-
 * office work where you are usually looking for an existing document; true is
 * ENTRY FIRST, with the list behind F8.
 */
import { useCallback, useEffect, useState } from "react";
import { useBusinessContext } from "@/components/layout/business-context";
import { StockAdjustmentEntryView } from "./components/stock-adjustment-entry-view";
import { StockAdjustmentListView } from "./components/stock-adjustment-list-view";
import type { StockAdjustmentDocKey } from "./stock-adjustment.types";
import { useStockAdjustmentSettings } from "./use-stock-adjustment-settings";

type View =
  | { screen: "list" }
  | { screen: "entry"; document?: StockAdjustmentDocKey; mode: "browse" | "entry"; seq: number };

export default function StockAdjustmentPage() {
  const { activeCompany, activeBranch, loading } = useBusinessContext();
  const companyId = activeCompany?.compId ?? activeCompany?.id ?? "";
  const branchId = activeBranch?.id ?? "";
  const { settings, settled } = useStockAdjustmentSettings(companyId, branchId);
  const [view, setView] = useState<View | null>(null);

  // The first view waits for the setting, so an entry-first desk does not
  // flash the list. With no company to read it for, the default holds.
  useEffect(() => {
    if (view !== null) {
      return;
    }
    if (settled || (!companyId && !loading)) {
      setView(settings.txnEntryFirst ? { screen: "entry", mode: "entry", seq: 0 } : { screen: "list" });
    }
  }, [companyId, loading, settings.txnEntryFirst, settled, view]);

  const onOpen = useCallback((document: StockAdjustmentDocKey, mode: "browse" | "entry") => {
    setView((current) => ({
      screen: "entry",
      document,
      mode,
      seq: (current?.screen === "entry" ? current.seq : 0) + 1,
    }));
  }, []);
  const onCreate = useCallback(() => {
    setView((current) => ({
      screen: "entry",
      mode: "entry",
      seq: (current?.screen === "entry" ? current.seq : 0) + 1,
    }));
  }, []);
  const onBackToList = useCallback(() => setView({ screen: "list" }), []);

  if (view === null) {
    return null;
  }
  return view.screen === "list" ? (
    <StockAdjustmentListView onCreate={onCreate} onOpen={onOpen} />
  ) : (
    <StockAdjustmentEntryView
      key={`${view.document?.svhId ?? "new"}:${view.seq}`}
      initialDocument={view.document}
      initialMode={view.mode}
      expiryGraceDays={settings.expiryGraceDays}
      onBackToList={onBackToList}
    />
  );
}
