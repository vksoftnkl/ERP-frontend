"use client";
/**
 * Opening Stock (menu 44) — the route.
 *
 * Two views on one route, the way `TxnMainView::openForMenu()` serves the menu:
 * the LIST (grid 99) by default, or the voucher screen ready to key when the
 * company works entry-first (`system.txn_entry_first`). Neither style loses a
 * route — the list's Add / Enter open the voucher, the voucher's F8 / Close come
 * back to the list. A document is identified by four fields (id, company,
 * branch, year), so nothing in the URL is worth deep-linking to.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useBusinessContext } from "@/components/layout/business-context";
import { OpeningStockEntryView } from "./components/opening-stock-entry-view";
import { OpeningStockListView } from "./components/opening-stock-list-view";
import type { OpeningStockDocKey } from "./opening-stock.types";
import { useOpeningStockSettings } from "./use-opening-stock-settings";

type View =
  | { screen: "list" }
  | { screen: "entry"; document?: OpeningStockDocKey; mode: "entry" | "browse"; nonce: number };

export default function OpeningStockPage() {
  const { activeCompany, activeBranch } = useBusinessContext();
  const companyId = activeCompany?.compId ?? activeCompany?.id ?? "";
  const branchId = activeBranch?.id ?? "";
  const { settings, loaded } = useOpeningStockSettings(companyId, branchId);

  const [view, setView] = useState<View>({ screen: "list" });
  /** The landing choice is made once, when the setting first answers — never after the operator moved. */
  const landedRef = useRef(false);

  useEffect(() => {
    if (landedRef.current || !loaded) {
      return;
    }
    landedRef.current = true;
    if (settings.txnEntryFirst) {
      setView((current) =>
        current.screen === "list" ? { screen: "entry", mode: "entry", nonce: Date.now() } : current,
      );
    }
  }, [loaded, settings.txnEntryFirst]);

  const onOpen = useCallback((document: OpeningStockDocKey, mode: "entry" | "browse") => {
    landedRef.current = true;
    setView({ screen: "entry", document, mode, nonce: Date.now() });
  }, []);
  const onCreate = useCallback(() => {
    landedRef.current = true;
    setView({ screen: "entry", mode: "entry", nonce: Date.now() });
  }, []);
  const onBackToList = useCallback(() => {
    landedRef.current = true;
    setView({ screen: "list" });
  }, []);

  return view.screen === "list" ? (
    <OpeningStockListView onCreate={onCreate} onOpen={onOpen} />
  ) : (
    <OpeningStockEntryView
      // A fresh screen per open: the document it shows is the one it was opened on.
      key={view.nonce}
      initialDocument={view.document}
      initialMode={view.mode}
      onBackToList={onBackToList}
    />
  );
}
