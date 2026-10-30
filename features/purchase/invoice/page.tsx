"use client";
/**
 * Purchase Entry (menu 24) — the route: the shared purchase list and this document's entry
 * screen (features/purchase/shared/components/purchase-document-page.tsx).
 *
 * GRN's Make bill · Ctrl+B lands here with the GRN in the URL (shared/purchase-handoff.ts
 * `?fromGrn=`, Qt GrnEntry::makeBill): a NEW bill on the GRN's supplier and godown
 * opens at once and brings that GRN's lines in; the query comes off the URL so a
 * reload lands on the plain list. A bill left unsaved here wins — it is reopened.
 */
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "@/lib/notify";
import { screenMemory } from "@/lib/screen-memory";
import { dropHandoffQuery, parseBillFromGrn, PURCHASE_ENTRY_ROUTE, type GrnHandoff } from "../shared/purchase-handoff";
import { PurchaseDocumentPage } from "../shared/components/purchase-document-page";
import { PURCHASE_DOC_TYPES } from "../shared/purchase.doc-types";
import { usePurchaseMemoryScope } from "../shared/use-purchase-scope";
import { PurchaseInvoiceEntryView } from "./components/purchase-invoice-entry-view";

const MEMORY_KEY = PURCHASE_DOC_TYPES.invoice.memoryKey;


export default function Page() {
  const searchParams = useSearchParams();
  const scope = usePurchaseMemoryScope();
  const [arrival] = useState(() => {
    const handoff = parseBillFromGrn(searchParams);
    return { handoff, remembered: handoff !== null && screenMemory.has(MEMORY_KEY, scope) };
  });
  const [fromGrn, setFromGrn] = useState<GrnHandoff | null>(arrival.remembered ? null : arrival.handoff);
  const memory = useMemo(() => ({ key: MEMORY_KEY, resume: false }), []);

  useEffect(() => {
    if (parseBillFromGrn(searchParams)) {
      dropHandoffQuery(PURCHASE_ENTRY_ROUTE);
    }
  }, [searchParams]);

  useEffect(() => {
    if (arrival.remembered && arrival.handoff) {
      toast.info(
        `An unsaved purchase bill was waiting — it is open again. Finish or close it, then bill ${arrival.handoff.refno || "the GRN"} from the GRN (Ctrl+B).`,
        { title: "Purchase Entry" },
      );
    }
  }, [arrival]);

  if (fromGrn) {
    return <PurchaseInvoiceEntryView initialMode="entry" fromGrn={fromGrn} onBackToList={() => setFromGrn(null)} memory={memory} />;
  }
  return (
    <PurchaseDocumentPage
      docType="invoice"
      EntryView={PurchaseInvoiceEntryView}
      initialView={arrival.handoff && !arrival.remembered ? "list" : undefined}
    />
  );
}
