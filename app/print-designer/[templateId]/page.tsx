"use client";

/**
 * Retired: the canvas is opened by the printing module now.
 *
 * The id in this URL is a `reports.print_template.pt_id`, and nothing reads
 * that table — `GET /reports/templates/:id` is 404 like the rest of
 * `/reports/*`. There is therefore no design to map it onto, so this sends the
 * user to the list rather than guessing at a `ptlId`.
 *
 * The canvas lives on at `/settings/printing/templates/<ptlId>/layout`, where a
 * host supplies the storage and the renderer — see
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
