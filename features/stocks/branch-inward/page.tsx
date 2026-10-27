"use client";
/**
 * Branch Inward (menu 193) — the route. The Stock Adjustment's two-view shape:
 * the register (grid 185) and the receipt on the same route; a document is
 * identified by four fields, so nothing in the URL is worth deep-linking to.
 *
 * Which one the menu lands on is `system.txn_entry_first` — the Qt
 * `TxnMainView::openForMenu` switch: false (the default) is LIST FIRST, true is
 * ENTRY FIRST, which here means the worklist of despatches on the way.
 */
import { useCallback, useEffect, useState } from "react";
import { useBusinessContext } from "@/components/layout/business-context";
import { BranchInwardEntryView } from "./components/branch-inward-entry-view";
import { BranchInwardListView } from "./components/branch-inward-list-view";
import type { BranchInwardDocKey } from "./branch-inward.types";
import { useStockAdjustmentSettings } from "../stock-adjustment/use-stock-adjustment-settings";

type View =
  | { screen: "list" }
  | { screen: "entry"; document?: BranchInwardDocKey; mode: "browse" | "entry"; seq: number };

export default function BranchInwardPage() {
  const { activeCompany, activeBranch, loading } = useBusinessContext();
  const companyId = activeCompany?.compId ?? activeCompany?.id ?? "";
  const branchId = activeBranch?.id ?? "";
  // `system.txn_entry_first` is one switch for every voucher screen; the stock module reads it once.
  const { settings, settled } = useStockAdjustmentSettings(companyId, branchId);
  const entryFirst = settings.txnEntryFirst;
  const [view, setView] = useState<View | null>(null);

  // The first view waits for the setting, so an entry-first desk does not flash the list.
  useEffect(() => {
    if (view !== null) {
      return;
    }
    if (settled || (!companyId && !loading)) {
      setView(entryFirst ? { screen: "entry", mode: "entry", seq: 0 } : { screen: "list" });
    }
  }, [companyId, entryFirst, loading, settled, view]);

  const onOpen = useCallback((document: BranchInwardDocKey, mode: "browse" | "entry") => {
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
    <BranchInwardListView onCreate={onCreate} onOpen={onOpen} />
  ) : (
    <BranchInwardEntryView
      key={`${view.document?.svhId ?? "new"}:${view.seq}`}
      initialDocument={view.document}
      initialMode={view.mode}
      onBackToList={onBackToList}
    />
  );
}
