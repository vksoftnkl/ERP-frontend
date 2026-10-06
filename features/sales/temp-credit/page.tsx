"use client";

/**
 * Temp Credits (menu 257) — the route. The register; Enter on a row opens the
 * bill behind the credit in the Sales Entry screen, read-only, on this same
 * route, as every register here does.
 */
import { useCallback, useState } from "react";
import { SaleBillEntryView } from "@/features/sales/salebill/components/sale-bill-entry-view";
import type { SaleBillDocKey } from "@/features/sales/salebill/salebill.types";
import { TempCreditListView } from "./temp-credit-list-view";

export default function TempCreditPage() {
  const [document, setDocument] = useState<SaleBillDocKey | null>(null);
  const onClose = useCallback(() => setDocument(null), []);
  return document ? (
    <SaleBillEntryView
      // Remounting on the bill starts the form clean for the next one.
      key={document.sbId}
      initialDocument={document}
      initialMode="browse"
      onClose={onClose}
    />
  ) : (
    <TempCreditListView onOpenBill={setDocument} />
  );
}
