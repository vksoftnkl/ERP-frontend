"use client";

import { Suspense } from "react";
import dynamic from "next/dynamic";
import RouteLoader from "@/components/feedback/route-loader";

const LazyRoutePage = dynamic(() => import("@/features/accounts/receipt/page"), {
  loading: () => <RouteLoader />,
  ssr: false,
});

export default function RoutePage() {
  // `useSearchParams` reads the `?collect=1&partyId=…` the Temp Credits
  // register's Receive sends, and Next wants a suspense boundary around it.
  return (
    <Suspense fallback={<RouteLoader />}>
      <LazyRoutePage />
    </Suspense>
  );
}
