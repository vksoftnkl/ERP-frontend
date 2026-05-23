"use client";

import dynamic from "next/dynamic";
import RouteLoader from "@/components/feedback/route-loader";

const RecordHistoryPage = dynamic(() => import("@/features/masters/record-history/page"), {
  loading: () => <RouteLoader />,
  ssr: false,
});

export default function RecordHistoryRoute() {
  return <RecordHistoryPage />;
}
