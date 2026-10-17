"use client";

import dynamic from "next/dynamic";
import RouteLoader from "@/components/feedback/route-loader";

/** Till Reports (menu 288, Sales › Till) — variance, exceptions, approvers, safe book (notes 133). */
const LazyRoutePage = dynamic(() => import("@/features/sales/till/reports/page"), {
  loading: () => <RouteLoader />,
  ssr: false,
});

export default function RoutePage() {
  return <LazyRoutePage />;
}
