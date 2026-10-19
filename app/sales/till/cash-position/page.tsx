"use client";

import dynamic from "next/dynamic";
import RouteLoader from "@/components/feedback/route-loader";

/** Cash Position (menu 289, Sales › Till) — head office's every-store page and its HO reviews (notes 134). */
const LazyRoutePage = dynamic(() => import("@/features/sales/till/cash-position/page"), {
  loading: () => <RouteLoader />,
  ssr: false,
});

export default function RoutePage() {
  return <LazyRoutePage />;
}
