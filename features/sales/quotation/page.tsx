"use client";
/**
 * Quotations — the route.
 *
 * The menu lands on the entry form with a fresh quotation, the way the legacy
 * screen opens: raising a quotation is what an operator comes here to do, and
 * the list is one click away (the form's "‹ Quotations" link, or F8's popup).
 *
 * That list IS a master page: it is the shared `CrudMasterPage` shell, so the
 * header, toolbar, configured-column table, row actions, delete confirmation,
 * pagination, audit history and grid-settings context menu are the same ones
 * every other master screen has. Create and Edit hand off to the voucher form in
 * place of the shell's modal; leaving the form comes back to it.
 *
 * The two views share one route rather than being two, because the form is a
 * single long-lived draft: a URL change would remount it, and there is nothing in
 * the URL worth deep-linking to — a quotation is identified by four fields
 * (id, company, branch, year), not by one id.
 */
import { useCallback, useState } from "react";
import { QuotationEntryView } from "./components/quotation-entry-view";
import { QuotationListView } from "./components/quotation-list-view";
import type { QuotationDocKey } from "./quotation.types";
type View =
  | { screen: "list" }
  | { screen: "entry"; document?: QuotationDocKey; mode: "browse" | "entry" };
export default function QuotationsPage() {
  const [view, setView] = useState<View>({ screen: "entry", mode: "entry" });
  const onOpen = useCallback((document: QuotationDocKey, mode: "browse" | "entry") => {
    setView({ screen: "entry", document, mode });
  }, []);
  const onCreate = useCallback(() => {
    setView({ screen: "entry", mode: "entry" });
  }, []);
  const onBackToList = useCallback(() => {
    setView({ screen: "list" });
  }, []);
  return view.screen === "list" ? (
    <QuotationListView onCreate={onCreate} onOpen={onOpen} />
  ) : (
    <QuotationEntryView
      initialDocument={view.document}
      initialMode={view.mode}
      onBackToList={onBackToList}
    />
  );
}