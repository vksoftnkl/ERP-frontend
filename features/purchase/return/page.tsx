"use client";
/**
 * Purchase Return (menu 25) — the route: the shared purchase list and this document's entry
 * screen (features/purchase/shared/components/purchase-document-page.tsx).
 *
 * Purchase Entry's Ctrl+F11 lands here with the bill in the URL
 * (shared/purchase-handoff.ts): a NEW return against it opens at once, and the
 * query comes off the URL so a reload lands on the plain list. A return left
 * unsaved here wins — it is reopened, and the bill is not taken.
 * GRN's Reject (Qt GrnEntry::rejectToSupplier) lands the same way with
 * `?againstGrn=` (shared/purchase-handoff.ts): a NEW return of kind "against GRN".
 */
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "@/lib/notify";
import { screenMemory } from "@/lib/screen-memory";
import { PurchaseDocumentPage } from "../shared/components/purchase-document-page";
import { PURCHASE_DOC_TYPES } from "../shared/purchase.doc-types";
import {
  dropHandoffQuery,
  parseReturnAgainstBill,
  parseReturnAgainstGrn,
  PURCHASE_RETURN_ROUTE,
  type ReturnAgainstBillHandoff,
} from "../shared/purchase-handoff";
import { usePurchaseMemoryScope } from "../shared/use-purchase-scope";

import { PurchaseReturnEntryView } from "./components/purchase-return-entry-view";
import type { ReturnKind } from "./return.constants";

type Arrival = ReturnAgainstBillHandoff & { kind?: ReturnKind };

/** The bill (Purchase Entry Ctrl+F11) or the GRN (GRN Reject) the URL hands over. */
function parseArrival(params: Parameters<typeof parseReturnAgainstBill>[0]): Arrival | null {
  const bill = parseReturnAgainstBill(params);
  if (bill) {
    return bill;
  }
  const grn = parseReturnAgainstGrn(params);
  return grn
    ? { piId: grn.grnId, accYear: grn.accYear, supplierId: grn.supplierId, supplierName: grn.supplierName, refno: grn.refno, kind: "AGAINST_GRN" }
    : null;
}

const MEMORY_KEY = PURCHASE_DOC_TYPES.return.memoryKey;

export default function Page() {
  const searchParams = useSearchParams();
  const scope = usePurchaseMemoryScope();
  // Read once, on arrival: what the URL handed over, and whether an unsaved return was waiting.
  const [arrival] = useState(() => {
    const handoff = parseArrival(searchParams);
    return { handoff, remembered: handoff !== null && screenMemory.has(MEMORY_KEY, scope) };
  });
  const [againstBill, setAgainstBill] = useState<Arrival | null>(
    arrival.remembered ? null : arrival.handoff,
  );
  const memory = useMemo(() => ({ key: MEMORY_KEY, resume: false }), []);

  // Consumed once: the query comes off the URL, so a reload lands on the list.
  useEffect(() => {
    if (parseArrival(searchParams)) {
      dropHandoffQuery(PURCHASE_RETURN_ROUTE);
    }
  }, [searchParams]);

  useEffect(() => {
    if (arrival.remembered && arrival.handoff) {
      toast.info(
        `An unsaved purchase return was waiting — it is open again. Finish or close it, then return goods against ${
          arrival.handoff.refno || (arrival.handoff.kind === "AGAINST_GRN" ? "the GRN" : "the bill")
        } ${arrival.handoff.kind === "AGAINST_GRN" ? "from the GRN (Reject)" : "from Purchase Entry (Ctrl+F11)"}.`,
        { title: "Purchase Return" },
      );
    }
  }, [arrival]);

  if (againstBill) {
    return (
      <PurchaseReturnEntryView
        initialMode="entry"
        againstBill={againstBill}
        onBackToList={() => setAgainstBill(null)}
        memory={memory}
      />
    );
  }
  // After a hand-off return closes, the list — not a blank new return on an entry-first desk.
  return (
    <PurchaseDocumentPage
      docType="return"
      EntryView={PurchaseReturnEntryView}
      initialView={arrival.handoff && !arrival.remembered ? "list" : undefined}
    />
  );
}
