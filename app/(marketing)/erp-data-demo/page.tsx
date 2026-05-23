"use client";

import dynamic from "next/dynamic";
import RouteLoader from "@/components/feedback/route-loader";

const ERPDataDemo = dynamic(() => import("@/components/ui/erp-data-demo"), {
  loading: () => <RouteLoader />,
  ssr: false,
});

export default function ERPDataDemoPage() {
  return <ERPDataDemo />;
}
