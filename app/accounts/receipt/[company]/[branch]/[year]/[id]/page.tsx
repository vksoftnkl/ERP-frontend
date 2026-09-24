"use client";

/**
 * One receipt, addressed by its four keys.
 *
 * ── Why the whole key is in the URL ──────────────────────────────────────
 * Every route on this module addresses a receipt by
 * `company · branch · accYear · voucherId`, never by a bare id:
 * `acc_voucher_header` is keyed on all four. A receipt from another branch or
 * another year is a perfectly ordinary thing to open — a cheque register row
 * from March, a neighbour two steps back in the walk — and it must open with
 * the keys it was WRITTEN with, not with whatever the session happens to hold.
 *
 * This is the drill-through target: Enter on a row of the cheque register
 * (menu 51) lands here. In Qt it was a modal factory; here it is a route, so
 * the receipt has an address that can be linked to.
 */
import { use } from "react";
import dynamic from "next/dynamic";
import RouteLoader from "@/components/feedback/route-loader";

const LazyReceiptScreen = dynamic(() => import("@/features/accounts/receipt/receipt-screen"), {
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
    <LazyReceiptScreen
      initialKeys={{
        avhVoucherId: decodeURIComponent(id),
        avhCompanyId: decodeURIComponent(company),
        avhBranchId: decodeURIComponent(branch),
        // `2026-2027` survives a path segment intact, but it is decoded for the
        // same reason the others are: nothing here should depend on which
        // characters an accounting year happens to contain.
        avhAccYear: decodeURIComponent(year),
      }}
    />
  );
}
