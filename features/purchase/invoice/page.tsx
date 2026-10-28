"use client";
/**
 * Purchase Entry (menu 24) — the route: the shared purchase list and this document's entry
 * screen (features/purchase/shared/components/purchase-document-page.tsx).
 */
import { PurchaseDocumentPage } from "../shared/components/purchase-document-page";
import { PurchaseInvoiceEntryView } from "./components/purchase-invoice-entry-view";

export default function Page() {
  return <PurchaseDocumentPage docType="invoice" EntryView={PurchaseInvoiceEntryView} />;
}
