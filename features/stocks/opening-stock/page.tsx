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
 *
 * A document left unsaved when the operator went to another screen is kept in
 * screen memory (lib/screen-memory), and the route then reopens ON it instead
 * of on the list or a blank voucher.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useBusinessContext } from "@/components/layout/business-context";
import { screenMemory } from "@/lib/screen-memory";
import { OpeningStockEntryView } from "./components/opening-stock-entry-view";
import { OpeningStockListView } from "./components/opening-stock-list-view";
import { OPENING_STOCK_MEMORY_KEY } from "./opening-stock.constants";
import type { OpeningStockDocKey } from "./opening-stock.types";
import { useOpeningStockScope } from "./use-opening-stock-draft";
import { useOpeningStockSettings } from "./use-opening-stock-settings";

type View =
  | { screen: "list" }
  | {
      screen: "entry";
      document?: OpeningStockDocKey;
      mode: "entry" | "browse";
      nonce: number;
      /** Reopened on the remembered document, not on an explicit Create / Open. */
      resume?: boolean;
    };

/** Nonce 0 is never a `Date.now()`, so a resume is always its own mount. */
const RESUME_VIEW: View = { screen: "entry", mode: "entry", nonce: 0, resume: true };

export default function OpeningStockPage() {
  const { activeCompany, activeBranch } = useBusinessContext();
  const companyId = activeCompany?.compId ?? activeCompany?.id ?? "";
  const branchId = activeBranch?.id ?? "";
  const { settings, loaded } = useOpeningStockSettings(companyId, branchId);
  const scope = useOpeningStockScope();

  const [view, setView] = useState<View>(() =>
    screenMemory.has(OPENING_STOCK_MEMORY_KEY, scope) ? RESUME_VIEW : { screen: "list" },
  );
  /** The landing choice is made once, when the setting first answers — never after the operator moved. */
  const landedRef = useRef(false);

  useEffect(() => {
    if (landedRef.current) {
      return;
    }
    // A remembered document reopens as soon as the tenant it belongs to is
    // known — the setting only picks where a fresh visit lands.
    if (screenMemory.has(OPENING_STOCK_MEMORY_KEY, scope)) {
      landedRef.current = true;
      setView(RESUME_VIEW);
      return;
    }
    if (!loaded) {
      return;
    }
    landedRef.current = true;
    if (settings.txnEntryFirst) {
      setView((current) =>
        current.screen === "list" ? { screen: "entry", mode: "entry", nonce: Date.now() } : current,
      );
    }
  }, [loaded, scope, settings.txnEntryFirst]);

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

  const resume = view.screen === "entry" && Boolean(view.resume);
  const memory = useMemo(() => ({ key: OPENING_STOCK_MEMORY_KEY, resume }), [resume]);

  return view.screen === "list" ? (
    <OpeningStockListView onCreate={onCreate} onOpen={onOpen} />
  ) : (
    <OpeningStockEntryView
      // A fresh screen per open: the document it shows is the one it was opened on.
      key={view.nonce}
      initialDocument={view.document}
      initialMode={view.mode}
      onBackToList={onBackToList}
      memory={memory}
    />
  );
}
