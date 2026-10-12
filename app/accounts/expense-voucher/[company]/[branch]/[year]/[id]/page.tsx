"use client";

/**
 * One expense voucher, addressed by its four keys — `acc_voucher_header` is
 * keyed on all four, and a voucher from another branch or year opens with the
 * keys it was WRITTEN with, never the session's.
 */
import { use } from "react";
import dynamic from "next/dynamic";
import RouteLoader from "@/components/feedback/route-loader";

const LazyExpenseScreen = dynamic(() => import("@/features/accounts/expense/expense-screen"), {
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
    <LazyExpenseScreen
      key={decodeURIComponent(id)}
      initialKeys={{
        voucherId: decodeURIComponent(id),
        companyId: decodeURIComponent(company),
        branchId: decodeURIComponent(branch),
        accYear: decodeURIComponent(year),
      }}
    />
  );
}
