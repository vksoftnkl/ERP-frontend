"use client";

import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import RouteLoader from "@/components/feedback/route-loader";

const LazyRoutePage = dynamic(() => import("@/features/masters/settings/dropdown-designer/page"), {
  loading: () => <RouteLoader />,
  ssr: false,
});

export default function RoutePage() {
  const searchParams = useSearchParams();
  const initialDropdownId =
    searchParams.get("dropdown_id") ?? searchParams.get("dropdownId") ?? undefined;
  return (
    <LazyRoutePage
      initialDropdownId={initialDropdownId}
      startNew={searchParams.get("mode") === "new"}
    />
  );
}
