"use client";

/** `/sales/till/safes` — Till Safes (menu 280, Till › Till Masters). */
import dynamic from "next/dynamic";
import RouteLoader from "@/components/feedback/route-loader";

const LazyRoutePage = dynamic(() => import("@/features/sales/till-masters/screens/safes"), {
  loading: () => <RouteLoader />,
  ssr: false,
});

export default function RoutePage() {
  return <LazyRoutePage />;
}
