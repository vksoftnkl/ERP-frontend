"use client";

/** Temp Credits — the route. Enter on a row opens the bill behind it, read-only. */
import { useCallback, useState } from "react";
import { SaleBillScreen } from "@/features/sales/testbill/components/sale-bill-screen";
import type { SaleBillDocKey } from "@/features/sales/testbill/types";
import { TempCreditListView } from "./temp-credit-list-view";

export default function TempCreditPage() {
  const [document, setDocument] = useState<SaleBillDocKey | null>(null);
  const onClose = useCallback(() => setDocument(null), []);
  return document ? (
    <SaleBillScreen key={document.sbId} initialDocument={document} initialMode="browse" onClose={onClose} />
  ) : (
    <TempCreditListView onOpenBill={setDocument} />
  );
}
