"use client";
import dynamic from "next/dynamic";
import RouteLoader from "@/components/feedback/route-loader";
const LazyRoutePage = dynamic(() => import("@/features/masters/sales/loading-charges/page"), {
  loading: () => <RouteLoader />,
  ssr: false,
});
export default function RoutePage() {
  return <LazyRoutePage />;
}