"use client";

import dynamic from "next/dynamic";
import RouteLoader from "@/components/feedback/route-loader";

/** Open Till (menu 272, Sales › Till) — the cashier's S1. */
const LazyRoutePage = dynamic(() => import("@/features/sales/till/session/page"), {
  loading: () => <RouteLoader />,
  ssr: false,
});

export default function RoutePage() {
  return <LazyRoutePage />;
}
