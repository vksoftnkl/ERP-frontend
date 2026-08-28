"use client";

/**
 * The canvas editor for one revision's body.
 *
 * A route of its own rather than a panel on the Layout tab: the canvas wants the
 * whole viewport, owns a keyboard map, and has its own unsaved-changes guard.
 */

import { Suspense, use } from "react";
import dynamic from "next/dynamic";
import RouteLoader from "@/components/feedback/route-loader";

const LazyCanvas = dynamic(
  () => import("@/features/printing/designer/LayoutCanvasScreen"),
  { loading: () => <RouteLoader />, ssr: false },
);

export default function RoutePage({ params }: { params: Promise<{ ptlId: string }> }) {
  const { ptlId } = use(params);
  // `?rev=` says which revision to open; `useSearchParams` needs a boundary.
  return (
    <Suspense fallback={<RouteLoader />}>
      <LazyCanvas ptlId={ptlId} />
    </Suspense>
  );
}
