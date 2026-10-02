"use client";

/**
 * Physical Stock Update (menu 45) — the route. `TxnMainView::openForMenu`:
 * the menu lands on the LIST (grid 101) unless `system.txn_entry_first` says
 * to land on the count screen itself. Either way neither loses a route — the
 * list's Add / Enter open the screen, and the screen's F8 raises the same list
 * as a picker.
 *
 * The picker is the list shown OVER a live count screen: the screen stays
 * mounted (hidden) while it is up, so Esc / Back returns to the sheet exactly
 * as it was, and a pick loads into that same screen.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import RouteLoader from "@/components/feedback/route-loader";
import { useBusinessContext } from "@/components/layout/business-context";
import { PhysicalStockEntryView, type PendingLoad } from "./components/physical-stock-entry-view";
import { PhysicalStockListView } from "./components/physical-stock-list-view";
import type { PhysicalStockDocKey } from "./physical-stock.types";
import { usePhysicalStockSettings } from "./use-physical-stock-settings";
import styles from "./page.module.scss";

type PageState = {
  view: "list" | "entry";
  /** The count screen, while one is open. */
  entry: { id: number; pending: PendingLoad | null } | null;
  /** The list was raised from the screen (F8): a pick loads into it. */
  pickMode: boolean;
};

export default function PhysicalStockPage() {
  const { activeCompany, activeBranch, loading } = useBusinessContext();
  const companyId = activeCompany?.id ?? activeCompany?.compId ?? "";
  const branchId = activeBranch?.id ?? "";
  const { settings, settled } = usePhysicalStockSettings(companyId, branchId);
  const [state, setState] = useState<PageState | null>(null);
  const nextId = useRef(1);

  // The first view is chosen once, when the setting that chooses it is known.
  useEffect(() => {
    if (state !== null || loading || (companyId && !settled)) {
      return;
    }
    setState(
      settings.txnEntryFirst
        ? { view: "entry", entry: { id: nextId.current++, pending: null }, pickMode: false }
        : { view: "list", entry: null, pickMode: false },
    );
  }, [companyId, loading, settings.txnEntryFirst, settled, state]);

  const onCreate = useCallback(() => {
    setState({ view: "entry", entry: { id: nextId.current++, pending: null }, pickMode: false });
  }, []);

  const onOpen = useCallback((key: PhysicalStockDocKey, openForEdit: boolean) => {
    setState((current) => {
      const pending: PendingLoad = { key, openForEdit, nonce: Date.now() };
      // Picked for the screen that asked: loaded into it, not into a new one.
      if (current?.pickMode && current.entry) {
        return { view: "entry", entry: { ...current.entry, pending }, pickMode: false };
      }
      return { view: "entry", entry: { id: nextId.current++, pending }, pickMode: false };
    });
  }, []);

  const onShowList = useCallback(() => {
    setState((current) => (current ? { ...current, view: "list", pickMode: true } : current));
  }, []);

  const onBackToEntry = useCallback(() => {
    setState((current) =>
      current?.entry ? { ...current, view: "entry", pickMode: false } : current,
    );
  }, []);

  const onClose = useCallback(() => {
    setState({ view: "list", entry: null, pickMode: false });
  }, []);

  if (state === null) {
    return <RouteLoader />;
  }

  return (
    <div className={styles.screen}>
      {state.view === "list" ? (
        <PhysicalStockListView
          pickMode={state.pickMode && state.entry !== null}
          onCreate={onCreate}
          onOpen={onOpen}
          onBackToEntry={onBackToEntry}
        />
      ) : null}
      {state.entry ? (
        <div
          className={styles.screen}
          style={state.view === "entry" ? undefined : { display: "none" }}
        >
          <PhysicalStockEntryView
            key={state.entry.id}
            active={state.view === "entry"}
            pendingLoad={state.entry.pending}
            onShowList={onShowList}
            onClose={onClose}
          />
        </div>
      ) : null}
    </div>
  );
}
