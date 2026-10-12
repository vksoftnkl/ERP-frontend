"use client";

import dynamic from "next/dynamic";
import RouteLoader from "@/components/feedback/route-loader";

/** Till Sessions (menu 273, Sales › Till) — the supervisor's register (S6). */
const LazyRoutePage = dynamic(() => import("@/features/sales/till/sessions/page"), {
  loading: () => <RouteLoader />,
  ssr: false,
});

export default function RoutePage() {
  return <LazyRoutePage />;
}
