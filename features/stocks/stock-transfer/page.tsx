"use client";
/**
 * Godown Transfer (menu 41) and Branch Outward (menu 192) — the route. The Stock
 * Adjustment page's two-view shape: the list (grid 183 / 184) and the voucher on
 * the same route; a document is identified by four fields, so nothing in the URL
 * is worth deep-linking to. One page component serves both menus: `mode` says
 * which, and the two route wrappers pass it.
 *
 * Which view the menu lands on is `system.txn_entry_first` (the Qt
 * `TxnMainView::openForMenu` switch): false (the default) is LIST FIRST, true
 * is ENTRY FIRST with the list behind Ctrl+O. A document left unsaved when the
 * operator went to another screen is kept in screen memory (lib/screen-memory),
 * and the route then reopens ON it.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useBusinessContext } from "@/components/layout/business-context";
import { screenMemory } from "@/lib/screen-memory";
import { useStockAdjustmentSettings } from "@/features/stocks/stock-adjustment/use-stock-adjustment-settings";
import { StockTransferEntryView } from "./components/stock-transfer-entry-view";
import { StockTransferListView } from "./components/stock-transfer-list-view";
import { STOCK_TRANSFER_MEMORY_KEYS, type TransferMode } from "./stock-transfer.constants";
import type { TransferDocKey } from "./stock-transfer.types";
import { useStockTransferScope } from "./use-stock-transfer-draft";

type View =
  | { screen: "list" }
  | {
      screen: "entry";
      document?: TransferDocKey;
      mode: "browse" | "entry";
      seq: number;
      /** Reopened on the remembered document, not on an explicit Create / Open. */
      resume?: boolean;
    };

const RESUME_VIEW: View = { screen: "entry", mode: "entry", seq: 0, resume: true };

export default function StockTransferPage({ mode }: { mode: TransferMode }) {
  const memoryKey = STOCK_TRANSFER_MEMORY_KEYS[mode];
  const { activeCompany, activeBranch, loading } = useBusinessContext();
  const companyId = activeCompany?.compId ?? activeCompany?.id ?? "";
  const branchId = activeBranch?.id ?? "";
  // Same settings the Stock Adjustment screen reads: entry-first and auto batch no.
  const { settings, settled } = useStockAdjustmentSettings(companyId, branchId);
  const scope = useStockTransferScope();
  const [view, setView] = useState<View | null>(() => (screenMemory.has(memoryKey, scope) ? RESUME_VIEW : null));

  // The first view waits for the setting, so an entry-first desk does not flash the list.
  useEffect(() => {
    if (view !== null) {
      return;
    }
    if (!loading && screenMemory.has(memoryKey, scope)) {
      setView(RESUME_VIEW);
      return;
    }
    if (settled || (!companyId && !loading)) {
      setView(settings.txnEntryFirst ? { screen: "entry", mode: "entry", seq: 0 } : { screen: "list" });
    }
  }, [companyId, loading, memoryKey, scope, settings.txnEntryFirst, settled, view]);

  const onOpen = useCallback((document: TransferDocKey, openMode: "browse" | "entry") => {
    setView((current) => ({
      screen: "entry",
      document,
      mode: openMode,
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

  const resume = view?.screen === "entry" && Boolean(view.resume);
  const memory = useMemo(() => ({ key: memoryKey, resume }), [memoryKey, resume]);

  if (view === null) {
    return null;
  }
  return view.screen === "list" ? (
    <StockTransferListView mode={mode} onCreate={onCreate} onOpen={onOpen} />
  ) : (
    <StockTransferEntryView
      key={view.resume ? "resume" : `${view.document?.svhId ?? "new"}:${view.seq}`}
      mode={mode}
      initialDocument={view.document}
      initialMode={view.mode}
      autoBatchNo={settings.autoBatchNo}
      onBackToList={onBackToList}
      memory={memory}
    />
  );
}
