"use client";

import dynamic from "next/dynamic";
import RouteLoader from "@/components/feedback/route-loader";

/**
 * Textile Tags (Qt NexERP 3b5069d, textile plan REV 3): one barcode label per
 * purchase line. No menu row yet (the server's step B-1, notes 136), so the
 * route is reached by its address.
 */
const LazyRoutePage = dynamic(() => import("@/features/stocks/textile-tags/page"), {
  loading: () => <RouteLoader />,
  ssr: false,
});

export default function RoutePage() {
  return <LazyRoutePage />;
}
