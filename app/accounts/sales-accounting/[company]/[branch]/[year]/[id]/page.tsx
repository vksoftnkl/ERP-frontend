"use client";

/**
 * One sales (accounting) voucher, addressed by its four BARE keys — a voucher from another
 * branch or year opens with the keys it was written with, never the session's.
 */
import { use } from "react";
import dynamic from "next/dynamic";
import RouteLoader from "@/components/feedback/route-loader";

const LazyRoutePage = dynamic(() => import("@/features/accounts/vouchers/sales-accounting-page"), {
  loading: () => <RouteLoader />,
  ssr: false,
});

type RouteParams = {
  company: string;
  branch: string;
  year: string;
  id: string;
};

export default function RoutePage({ params }: { params: Promise<RouteParams> }) {
  const { company, branch, year, id } = use(params);
  return (
    <LazyRoutePage
      initialKeys={{
        companyId: decodeURIComponent(company),
        branchId: decodeURIComponent(branch),
        accYear: decodeURIComponent(year),
        voucherId: decodeURIComponent(id),
      }}
    />
  );
}
