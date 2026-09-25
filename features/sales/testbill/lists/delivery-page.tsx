"use client";

/**
 * Bill Delivery Update — the route. Enter on a row opens the bill read-only
 * on the same route, the way the register does; Close comes back here.
 */
import { useCallback, useState } from "react";
import { SaleBillScreen } from "@/features/sales/testbill/components/sale-bill-screen";
import type { SaleBillDocKey } from "@/features/sales/testbill/types";
import { DeliveryListView } from "./delivery-list-view";

export default function DeliveryPage() {
  const [document, setDocument] = useState<SaleBillDocKey | null>(null);
  const onClose = useCallback(() => setDocument(null), []);
  return document ? (
    <SaleBillScreen key={document.sbId} initialDocument={document} initialMode="browse" onClose={onClose} />
  ) : (
    <DeliveryListView onOpen={setDocument} />
  );
}
