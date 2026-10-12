"use client";

import dynamic from "next/dynamic";
import RouteLoader from "@/components/feedback/route-loader";

/** Business Day (menu 274, Sales › Till). */
const LazyRoutePage = dynamic(() => import("@/features/sales/till/business-day/page"), {
  loading: () => <RouteLoader />,
  ssr: false,
});

export default function RoutePage() {
  return <LazyRoutePage />;
}
