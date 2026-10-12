"use client";

import dynamic from "next/dynamic";
import RouteLoader from "@/components/feedback/route-loader";

const LazyRoutePage = dynamic(() => import("@/features/sales/till/approval-setup/page"), {
  loading: () => <RouteLoader />,
  ssr: false,
});

/** Till Approval Setup — menu 276 under 271 "Till". */
export default function RoutePage() {
  return <LazyRoutePage />;
}
