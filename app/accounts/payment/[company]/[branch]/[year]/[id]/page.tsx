"use client";

/**
 * One payment, addressed by its four keys — `acc_voucher_header` is keyed on
 * all four, and a payment from another branch or year opens with the keys it
 * was WRITTEN with, never the session's.
 */
import { use } from "react";
import dynamic from "next/dynamic";
import RouteLoader from "@/components/feedback/route-loader";

const LazyPaymentScreen = dynamic(() => import("@/features/accounts/payment/payment-screen"), {
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
    <LazyPaymentScreen
      initialKeys={{
        avhVoucherId: decodeURIComponent(id),
        avhCompanyId: decodeURIComponent(company),
        avhBranchId: decodeURIComponent(branch),
        avhAccYear: decodeURIComponent(year),
      }}
    />
  );
}
