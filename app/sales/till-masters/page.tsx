"use client";

/** `/sales/till-masters` — Till Masters (menu 275, Sales › Till): grids 133–136. */
import dynamic from "next/dynamic";
import RouteLoader from "@/components/feedback/route-loader";

const LazyRoutePage = dynamic(() => import("@/features/sales/till-masters/page"), {
  loading: () => <RouteLoader />,
  ssr: false,
});

export default function RoutePage() {
  return <LazyRoutePage />;
}
