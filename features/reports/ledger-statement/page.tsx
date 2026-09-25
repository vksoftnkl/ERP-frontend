"use client";

/**
 * Ledger Statement — the route's body. `useSearchParams` needs a Suspense
 * boundary above it, and the URL is this screen's whole state.
 */
import { Suspense } from "react";
import RouteLoader from "@/components/feedback/route-loader";
import LedgerStatementScreen from "./ledger-statement-screen";

export default function LedgerStatementPage() {
  return (
    <Suspense fallback={<RouteLoader />}>
      <LedgerStatementScreen />
    </Suspense>
  );
}
