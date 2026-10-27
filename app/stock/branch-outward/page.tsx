"use client";

import dynamic from "next/dynamic";
import RouteLoader from "@/components/feedback/route-loader";

const LazyRoutePage = dynamic(() => import("@/features/stocks/stock-transfer/page"), {
  loading: () => <RouteLoader />,
  ssr: false,
});

export default function RoutePage() {
  return <LazyRoutePage mode="branch" />;
}
