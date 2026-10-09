"use client";

/**
 * Party-wise Outstanding — the route's body. `useSearchParams` needs a
 * Suspense boundary above it, and the URL is this screen's whole state.
 */
import { Suspense } from "react";
import RouteLoader from "@/components/feedback/route-loader";
import PartyOutstandingScreen from "./party-outstanding-screen";

export default function PartyOutstandingPage() {
  return (
    <Suspense fallback={<RouteLoader />}>
      <PartyOutstandingScreen />
    </Suspense>
  );
}
