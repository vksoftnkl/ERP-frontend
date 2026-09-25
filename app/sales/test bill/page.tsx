"use client";

/**
 * `/sales/test bill` — the same Sales Entry screen as `/sales/sale-bill`,
 * mounted on a second route so the REV 2 port can be exercised side by side
 * with the menu-governed one. Nothing is different underneath: one feature
 * module, one draft slice.
 */
import dynamic from "next/dynamic";
import RouteLoader from "@/components/feedback/route-loader";

const LazyRoutePage = dynamic(() => import("@/features/sales/salebill/page"), {
  loading: () => <RouteLoader />,
  ssr: false,
});

export default function RoutePage() {
  return <LazyRoutePage />;
}
