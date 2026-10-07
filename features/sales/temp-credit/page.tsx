"use client";

/**
 * Temp Credits (menu 257) — the route. The register; Enter on a row opens the
 * bill behind the credit in the Sales Entry screen, read-only, and Add opens a
 * fresh bill — the only place a temp credit is made, by its TEMP_CR tender —
 * both on this same route, as every register here does.
 */
import { useCallback, useState } from "react";
import { SaleBillEntryView } from "@/features/sales/salebill/components/sale-bill-entry-view";
import type { SaleBillDocKey } from "@/features/sales/salebill/salebill.types";
import { TempCreditListView } from "./temp-credit-list-view";

type View =
  | { screen: "list" }
  | { screen: "bill"; document?: SaleBillDocKey; mode: "browse" | "entry" };

export default function TempCreditPage() {
  const [view, setView] = useState<View>({ screen: "list" });
  const onOpenBill = useCallback((document: SaleBillDocKey) => {
    setView({ screen: "bill", document, mode: "browse" });
  }, []);
  const onCreateBill = useCallback(() => {
    setView({ screen: "bill", mode: "entry" });
  }, []);
  // The register remounts on the way back, so it re-reads — a bill just
  // tendered on TEMP_CR is already in it.
  const onClose = useCallback(() => setView({ screen: "list" }), []);
  return view.screen === "bill" ? (
    <SaleBillEntryView
      // Remounting on the bill starts the form clean for the next one.
      key={view.document?.sbId ?? "new"}
      initialDocument={view.document}
      initialMode={view.mode}
      onClose={onClose}
    />
  ) : (
    <TempCreditListView onOpenBill={onOpenBill} onCreateBill={onCreateBill} />
  );
}
