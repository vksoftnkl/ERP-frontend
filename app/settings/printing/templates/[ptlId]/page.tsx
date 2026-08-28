"use client";

import { use } from "react";
import dynamic from "next/dynamic";
import RouteLoader from "@/components/feedback/route-loader";

const LazyDesigner = dynamic(() => import("@/features/printing/designer/DesignerScreen"), {
  loading: () => <RouteLoader />,
  ssr: false,
});

export default function RoutePage({ params }: { params: Promise<{ ptlId: string }> }) {
  const { ptlId } = use(params);
  return <LazyDesigner ptlId={ptlId} />;
}
