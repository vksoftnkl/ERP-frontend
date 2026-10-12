"use client";

import { Suspense } from "react";
import dynamic from "next/dynamic";
import RouteLoader from "@/components/feedback/route-loader";

const LazyRoutePage = dynamic(() => import("@/features/accounts/settlement/page"), {
  loading: () => <RouteLoader />,
  ssr: false,
});

export default function RoutePage() {
  // `useSearchParams` reads `?asiId=…&accYear=…` (open that payout on arrival),
  // and Next wants a suspense boundary around it.
  return (
    <Suspense fallback={<RouteLoader />}>
      <LazyRoutePage />
    </Suspense>
  );
}
