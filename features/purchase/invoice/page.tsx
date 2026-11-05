"use client";
/**
 * Purchase Entry (menu 24) — the route: the shared purchase list and this document's entry
 * screen (features/purchase/shared/components/purchase-document-page.tsx).
 *
 * Two hand-offs land here (shared/purchase-handoff.ts), read once:
 * - GRN's Make bill · Ctrl+B (`?fromGrn=`, Qt GrnEntry::makeBill): a NEW bill on the GRN's
 *   supplier and godown brings that GRN's lines in;
 * - PO's Make Purchase Invoice (`?fromPo=`, Qt PurchaseOrderEntry::makeInvoice): a NEW bill on
 *   the PO's supplier and godown brings the PO's pending lines in (From PO).
 * The query comes off the URL so a reload lands on the plain list. A bill left unsaved here
 * wins — it is reopened, and a message says how to repeat the hand-off.
 */
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "@/lib/notify";
import { screenMemory } from "@/lib/screen-memory";
import {
  dropHandoffQuery,
  parseBillFromGrn,
  parseBillFromPo,
  PURCHASE_ENTRY_ROUTE,
  type BillFromPoHandoff,
  type GrnHandoff,
} from "../shared/purchase-handoff";
import { PurchaseDocumentPage } from "../shared/components/purchase-document-page";
import { PURCHASE_DOC_TYPES } from "../shared/purchase.doc-types";
import { usePurchaseMemoryScope } from "../shared/use-purchase-scope";
import { PurchaseInvoiceEntryView } from "./components/purchase-invoice-entry-view";

const MEMORY_KEY = PURCHASE_DOC_TYPES.invoice.memoryKey;

export default function Page() {
  const searchParams = useSearchParams();
  const scope = usePurchaseMemoryScope();
  const [arrival] = useState(() => {
    const grn = parseBillFromGrn(searchParams);
    // one hand-off at a time: a GRN's wins over a PO's (the two markers never travel together)
    const po = grn ? null : parseBillFromPo(searchParams);
    return { grn, po, remembered: (grn !== null || po !== null) && screenMemory.has(MEMORY_KEY, scope) };
  });
  const [fromGrn, setFromGrn] = useState<GrnHandoff | null>(arrival.remembered ? null : arrival.grn);
  const [fromPo, setFromPo] = useState<BillFromPoHandoff | null>(arrival.remembered ? null : arrival.po);
  const memory = useMemo(() => ({ key: MEMORY_KEY, resume: false }), []);

  useEffect(() => {
    if (parseBillFromGrn(searchParams) || parseBillFromPo(searchParams)) {
      dropHandoffQuery(PURCHASE_ENTRY_ROUTE);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!arrival.remembered) {
      return;
    }
    if (arrival.grn) {
      toast.info(
        `An unsaved purchase bill was waiting — it is open again. Finish or close it, then bill ${arrival.grn.refno || "the GRN"} from the GRN (Ctrl+B).`,
        { title: "Purchase Entry" },
      );
    } else if (arrival.po) {
      toast.info(
        `An unsaved purchase bill was waiting — it is open again. Finish or close it, then bill ${arrival.po.refno || "the PO"} from the PO (Make Purchase Invoice).`,
        { title: "Purchase Entry" },
      );
    }
  }, [arrival]);

  if (fromGrn) {
    return <PurchaseInvoiceEntryView initialMode="entry" fromGrn={fromGrn} onBackToList={() => setFromGrn(null)} memory={memory} />;
  }
  if (fromPo) {
    return <PurchaseInvoiceEntryView initialMode="entry" fromPo={fromPo} onBackToList={() => setFromPo(null)} memory={memory} />;
  }
  const arrived = (arrival.grn !== null || arrival.po !== null) && !arrival.remembered;
  return <PurchaseDocumentPage docType="invoice" EntryView={PurchaseInvoiceEntryView} initialView={arrived ? "list" : undefined} />;
}
