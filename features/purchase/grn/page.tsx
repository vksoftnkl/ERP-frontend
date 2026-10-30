"use client";
/**
 * GRN (menu 196) — the route: the shared purchase list and this document's entry
 * screen (features/purchase/shared/components/purchase-document-page.tsx).
 *
 * PO's Make GRN · Ctrl+G lands here with the PO in the URL (shared/purchase-handoff.ts
 * `?fromPo=`, Qt PurchaseOrderEntry::makeGrn): a NEW GRN on the PO's supplier and
 * godown opens at once and brings that PO's pending lines in (From PO); the query
 * comes off the URL so a reload lands on the plain list. A GRN left unsaved here
 * wins — it is reopened, and the PO is not taken.
 */
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "@/lib/notify";
import { screenMemory } from "@/lib/screen-memory";
import { PurchaseDocumentPage } from "../shared/components/purchase-document-page";
import { PURCHASE_DOC_TYPES } from "../shared/purchase.doc-types";
import { dropHandoffQuery, GRN_ROUTE, parseGrnFromPo, type GrnFromPoHandoff } from "../shared/purchase-handoff";
import { usePurchaseMemoryScope } from "../shared/use-purchase-scope";
import { GrnEntryView } from "./components/grn-entry-view";

const MEMORY_KEY = PURCHASE_DOC_TYPES.grn.memoryKey;

export default function Page() {
  const searchParams = useSearchParams();
  const scope = usePurchaseMemoryScope();
  // Read once, on arrival: what the URL handed over, and whether an unsaved GRN was waiting.
  const [arrival] = useState(() => {
    const handoff = parseGrnFromPo(searchParams);
    return { handoff, remembered: handoff !== null && screenMemory.has(MEMORY_KEY, scope) };
  });
  const [fromPo, setFromPo] = useState<GrnFromPoHandoff | null>(arrival.remembered ? null : arrival.handoff);
  const memory = useMemo(() => ({ key: MEMORY_KEY, resume: false }), []);

  // Consumed once: the query comes off the URL, so a reload lands on the list.
  useEffect(() => {
    if (parseGrnFromPo(searchParams)) {
      dropHandoffQuery(GRN_ROUTE);
    }
  }, [searchParams]);

  useEffect(() => {
    if (arrival.remembered && arrival.handoff) {
      toast.info(
        `An unsaved GRN was waiting — it is open again. Finish or close it, then make the GRN for ${arrival.handoff.refno || "the PO"} from the PO (Ctrl+G).`,
        { title: "GRN" },
      );
    }
  }, [arrival]);

  if (fromPo) {
    return <GrnEntryView initialMode="entry" fromPo={fromPo} onBackToList={() => setFromPo(null)} memory={memory} />;
  }
  // After a hand-off GRN closes, the list — not a blank new GRN on an entry-first desk.
  return (
    <PurchaseDocumentPage
      docType="grn"
      EntryView={GrnEntryView}
      initialView={arrival.handoff && !arrival.remembered ? "list" : undefined}
    />
  );
}
