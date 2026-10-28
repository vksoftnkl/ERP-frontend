"use client";

/**
 * One purchase document's route — the Stock Adjustment's two-view shape: the
 * list (grid 189–193) and the document on the same route. A document is
 * addressed by four fields, so nothing in the URL is worth deep-linking to.
 *
 * Which view the menu lands on is `system.txn_entry_first` (Qt
 * `TxnMainView::openForMenu`): false (the default) is LIST FIRST, true is ENTRY
 * FIRST with the list behind Ctrl+O. A document left unsaved when the operator
 * went to another screen is kept in screen memory (lib/screen-memory) under the
 * document type's `memoryKey`, and the route then reopens ON it.
 */
import { useCallback, useEffect, useMemo, useState, type ComponentType } from "react";
import { useBusinessContext } from "@/components/layout/business-context";
import { screenMemory } from "@/lib/screen-memory";
import { PURCHASE_DOC_TYPES } from "../purchase.doc-types";
import type { PurchaseDocKey, PurchaseDocType, PurchaseEntryViewProps } from "../purchase.types";
import { usePurchaseMemoryScope, useTxnEntryFirst } from "../use-purchase-scope";
import { PurchaseListView } from "./purchase-list-view";

type View =
  | { screen: "list" }
  | {
      screen: "entry";
      document?: PurchaseDocKey;
      mode: "browse" | "entry";
      seq: number;
      /** Reopened on the remembered document, not on an explicit Create / Open. */
      resume?: boolean;
    };

const RESUME_VIEW: View = { screen: "entry", mode: "entry", seq: 0, resume: true };

export type PurchaseDocumentPageProps = {
  docType: PurchaseDocType;
  EntryView: ComponentType<PurchaseEntryViewProps>;
};

export function PurchaseDocumentPage({ docType, EntryView }: PurchaseDocumentPageProps) {
  const memoryKey = PURCHASE_DOC_TYPES[docType].memoryKey;
  const { activeCompany, activeBranch, loading } = useBusinessContext();
  const companyId = activeCompany?.compId ?? activeCompany?.id ?? "";
  const branchId = activeBranch?.id ?? "";
  const { entryFirst, settled } = useTxnEntryFirst(companyId, branchId);
  const scope = usePurchaseMemoryScope();
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
      setView(entryFirst ? { screen: "entry", mode: "entry", seq: 0 } : { screen: "list" });
    }
  }, [companyId, entryFirst, loading, memoryKey, scope, settled, view]);

  const onOpen = useCallback((document: PurchaseDocKey, openMode: "browse" | "entry") => {
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
    <PurchaseListView docType={docType} onCreate={onCreate} onOpen={onOpen} />
  ) : (
    <EntryView
      key={view.resume ? "resume" : `${view.document?.id ?? "new"}:${view.seq}`}
      initialDocument={view.document}
      initialMode={view.mode}
      onBackToList={onBackToList}
      memory={memory}
    />
  );
}
