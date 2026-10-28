"use client";
/**
 * Shortage Receipt (menu 195) — the route: the shared purchase list and this document's entry
 * screen (features/purchase/shared/components/purchase-document-page.tsx).
 */
import { PurchaseDocumentPage } from "../shared/components/purchase-document-page";
import { ShortageReceiptEntryView } from "./components/shortage-receipt-entry-view";

export default function Page() {
  return <PurchaseDocumentPage docType="shortage" EntryView={ShortageReceiptEntryView} />;
}
