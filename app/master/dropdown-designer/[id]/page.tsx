"use client";

import dynamic from "next/dynamic";
import { use } from "react";
import RouteLoader from "@/components/feedback/route-loader";

const LazyRoutePage = dynamic(() => import("@/features/masters/settings/dropdown-designer/page"), {
  loading: () => <RouteLoader />,
  ssr: false,
});

export default function RoutePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <LazyRoutePage initialDropdownId={id} />;
}
