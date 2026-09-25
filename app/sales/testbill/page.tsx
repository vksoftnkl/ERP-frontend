"use client";

/**
 * `/sales/testbill` — the REV 2 port of the Sales Entry screen
 * (`docs/plan-react-sale-bill.md`), mounted on its own route so it can be
 * exercised side by side with `/sales/sale-bill`. One feature module, its own
 * local draft.
 */
import dynamic from "next/dynamic";
import RouteLoader from "@/components/feedback/route-loader";

const LazyRoutePage = dynamic(() => import("@/features/sales/testbill/page"), {
  loading: () => <RouteLoader />,
  ssr: false,
});

export default function RoutePage() {
  return <LazyRoutePage />;
}
