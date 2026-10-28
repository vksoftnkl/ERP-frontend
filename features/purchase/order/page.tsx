"use client";
/**
 * Purchase Order (menu 23) — the route: the shared purchase list and this document's entry
 * screen (features/purchase/shared/components/purchase-document-page.tsx).
 */
import { PurchaseDocumentPage } from "../shared/components/purchase-document-page";
import { PurchaseOrderEntryView } from "./components/purchase-order-entry-view";

export default function Page() {
  return <PurchaseDocumentPage docType="order" EntryView={PurchaseOrderEntryView} />;
}
