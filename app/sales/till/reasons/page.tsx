"use client";

/** `/sales/till/reasons` — Till Reasons (menu 281, Till › Till Masters). */
import dynamic from "next/dynamic";
import RouteLoader from "@/components/feedback/route-loader";

const LazyRoutePage = dynamic(() => import("@/features/sales/till-masters/screens/reasons"), {
  loading: () => <RouteLoader />,
  ssr: false,
});

export default function RoutePage() {
  return <LazyRoutePage />;
}
