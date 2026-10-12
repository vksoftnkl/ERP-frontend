"use client";

/**
 * Account Day Summary — the route's body. `useSearchParams` needs a Suspense
 * boundary above it, and the URL is this screen's whole state.
 */
import { Suspense } from "react";
import RouteLoader from "@/components/feedback/route-loader";
import DaySummaryScreen from "./day-summary-screen";

export default function DaySummaryPage() {
  return (
    <Suspense fallback={<RouteLoader />}>
      <DaySummaryScreen />
    </Suspense>
  );
}
