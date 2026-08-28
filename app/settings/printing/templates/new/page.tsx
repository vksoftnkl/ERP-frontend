"use client";

/**
 * There is no separate create screen: "New template" opens the Designer blank.
 * No `ptlId`, no `ptvId`, and the one save call creates the template and
 * revision 1 together.
 */

import dynamic from "next/dynamic";
import RouteLoader from "@/components/feedback/route-loader";

const LazyDesigner = dynamic(() => import("@/features/printing/designer/DesignerScreen"), {
  loading: () => <RouteLoader />,
  ssr: false,
});

export default function RoutePage() {
  return <LazyDesigner ptlId={null} />;
}
