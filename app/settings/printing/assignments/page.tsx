"use client";

import { Suspense } from "react";
import dynamic from "next/dynamic";
import RouteLoader from "@/components/feedback/route-loader";

const LazyRoutePage = dynamic(
  () => import("@/features/printing/assignments/AssignmentsScreen"),
  { loading: () => <RouteLoader />, ssr: false },
);

export default function RoutePage() {
  // `useSearchParams` reads the `?ptaTemplateId=` a design's "used by" link
  // carries, and Next requires a suspense boundary around it.
  return (
    <Suspense fallback={<RouteLoader />}>
      <LazyRoutePage />
    </Suspense>
  );
}
