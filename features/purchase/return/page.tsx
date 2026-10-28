"use client";
/**
 * Purchase Return (menu 25) — the route: the shared purchase list and this document's entry
 * screen (features/purchase/shared/components/purchase-document-page.tsx).
 */
import { PurchaseDocumentPage } from "../shared/components/purchase-document-page";
import { PurchaseReturnEntryView } from "./components/purchase-return-entry-view";

export default function Page() {
  return <PurchaseDocumentPage docType="return" EntryView={PurchaseReturnEntryView} />;
}
