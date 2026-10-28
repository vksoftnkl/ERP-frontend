"use client";
/**
 * GRN (menu 196) — the route: the shared purchase list and this document's entry
 * screen (features/purchase/shared/components/purchase-document-page.tsx).
 */
import { PurchaseDocumentPage } from "../shared/components/purchase-document-page";
import { GrnEntryView } from "./components/grn-entry-view";

export default function Page() {
  return <PurchaseDocumentPage docType="grn" EntryView={GrnEntryView} />;
}
