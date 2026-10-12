"use client";

/**
 * One till session's cockpit (S5), addressed by its four keys.
 *
 * `accounts.till_session` is partitioned by year, and every session route
 * takes company · branch · accYear · tssId — so the cockpit opens with the
 * keys the session was WRITTEN with, not whatever the header picker holds.
 * The Sessions list (Enter) and the Business Day screen both link here.
 */
import { use } from "react";
import dynamic from "next/dynamic";
import RouteLoader from "@/components/feedback/route-loader";

const LazyCockpitScreen = dynamic(() => import("@/features/sales/till/sessions/cockpit-screen"), {
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
    <LazyCockpitScreen
      initialKey={{
        companyId: decodeURIComponent(company),
        branchId: decodeURIComponent(branch),
        accYear: decodeURIComponent(year),
        tssId: decodeURIComponent(id),
      }}
    />
  );
}
