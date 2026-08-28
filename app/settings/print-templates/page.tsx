"use client";

/**
 * The old print-designer list, retired to a redirect.
 *
 * This route rendered `features/print-designer/list/page`, a client of
 * `GET /reports/templates`. The server has no reporting module — every
 * `/reports/*` route answers 404, including the `POST /reports/preview` behind
 * the designer's Preview button — so the screen could only ever show an error,
 * and the designer it opened could not load, save or render anything.
 *
 * The same job is done by the 17_printing engine over tables that exist. Anyone
 * arriving here from a bookmark or an old link is sent there rather than shown
 * a broken list. The canvas itself is not retired: `features/print-designer` is
 * what `/settings/printing/templates/<ptlId>/layout` mounts, hosted — see
 * `features/print-designer/host/canvas-host`.
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import RouteLoader from "@/components/feedback/route-loader";
import { PRINTING_TEMPLATES_ROUTE } from "@/features/printing/routes";

export default function RoutePage() {
  const router = useRouter();

  useEffect(() => {
    router.replace(PRINTING_TEMPLATES_ROUTE);
  }, [router]);

  return <RouteLoader />;
}
