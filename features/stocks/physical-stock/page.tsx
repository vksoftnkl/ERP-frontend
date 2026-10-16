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
 *
 * A count left unsaved when the operator went to another screen is kept in
 * screen memory (lib/screen-memory), and the route then reopens ON it instead
 * of on the list or a blank sheet.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import RouteLoader from "@/components/feedback/route-loader";
import { useBusinessContext } from "@/components/layout/business-context";
import { screenMemory } from "@/lib/screen-memory";
import { PhysicalStockEntryView, type PendingLoad } from "./components/physical-stock-entry-view";
import { PhysicalStockListView } from "./components/physical-stock-list-view";
import { PHYSICAL_STOCK_MEMORY_KEY } from "./physical-stock.constants";
import type { PhysicalStockDocKey } from "./physical-stock.types";
import { usePhysicalStockScope } from "./use-physical-stock-draft";
import { usePhysicalStockSettings } from "./use-physical-stock-settings";
import styles from "./page.module.scss";

type PageState = {
  view: "list" | "entry";
  /**
   * The count screen, while one is open. `resume`: reopened on the remembered
   * count, not on an explicit Create / Open.
   */
  entry: { id: number; pending: PendingLoad | null; resume?: boolean } | null;
  /** The list was raised from the screen (F8): a pick loads into it. */
  pickMode: boolean;
};

/** Id 0 is never handed out by `nextId`, so a resume is always its own mount. */
const RESUME_STATE: PageState = {
  view: "entry",
  entry: { id: 0, pending: null, resume: true },
  pickMode: false,
};

export default function PhysicalStockPage() {
  const { activeCompany, activeBranch, loading } = useBusinessContext();
  const companyId = activeCompany?.id ?? activeCompany?.compId ?? "";
  const branchId = activeBranch?.id ?? "";
  const { settings, settled } = usePhysicalStockSettings(companyId, branchId);
  const scope = usePhysicalStockScope();
  const [state, setState] = useState<PageState | null>(() =>
    screenMemory.has(PHYSICAL_STOCK_MEMORY_KEY, scope) ? RESUME_STATE : null,
  );
  const nextId = useRef(1);

  // The first view is chosen once, when the setting that chooses it is known —
  // unless a count is waiting in screen memory: that one reopens as soon as the
  // tenant is, since the setting only picks where a fresh visit lands.
  useEffect(() => {
    if (state !== null || loading) {
      return;
    }
    const resume = screenMemory.has(PHYSICAL_STOCK_MEMORY_KEY, scope);
    if (!resume && companyId && !settled) {
      return;
    }
    setState(
      resume
        ? RESUME_STATE
        : settings.txnEntryFirst
          ? { view: "entry", entry: { id: nextId.current++, pending: null }, pickMode: false }
          : { view: "list", entry: null, pickMode: false },
    );
  }, [companyId, loading, scope, settings.txnEntryFirst, settled, state]);

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

  const resume = Boolean(state?.entry?.resume);
  const memory = useMemo(() => ({ key: PHYSICAL_STOCK_MEMORY_KEY, resume }), [resume]);

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
            memory={memory}
          />
        </div>
      ) : null}
    </div>
  );
}
