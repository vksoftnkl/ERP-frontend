"use client";

import dynamic from "next/dynamic";
import RouteLoader from "@/components/feedback/route-loader";

/** Cash Office (menu 287, Sales › Till) — the safe: balance, count, remittance (notes 118). */
const LazyRoutePage = dynamic(() => import("@/features/sales/till/cash-office/page"), {
  loading: () => <RouteLoader />,
  ssr: false,
});

export default function RoutePage() {
  return <LazyRoutePage />;
}
