"use client";

import dynamic from "next/dynamic";
import RouteLoader from "@/components/feedback/route-loader";

const LazyRoutePage = dynamic(() => import("@/features/masters/purchase/agents/page"), {
  loading: () => <RouteLoader />,
  ssr: false,
});

export default function RoutePage() {
  return <LazyRoutePage />;
}
