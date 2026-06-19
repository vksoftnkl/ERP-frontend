"use client";

import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import RouteLoader from "@/components/feedback/route-loader";

const LazyRoutePage = dynamic(() => import("@/features/masters/settings/ui-table-designer/[id]/page"), {
  loading: () => <RouteLoader />,
  ssr: false,
});

export default function RoutePage() {
  const searchParams = useSearchParams();
  return <LazyRoutePage startNew={searchParams.get("mode") === "new"} />;
}
