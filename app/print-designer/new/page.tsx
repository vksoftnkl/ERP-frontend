"use client";

/**
 * Retired: a new design starts in the printing module now.
 *
 * This route opened the canvas with no host, which meant it saved through
 * `POST /reports/templates` and previewed through `POST /reports/preview` —
 * both 404, because the server has no reporting module. A design has to belong
 * to a `print_template` row before anything can be rendered from it (the
 * renderer takes a REVISION id), so the way in is the printing module's own
 * "new template" screen.
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import RouteLoader from "@/components/feedback/route-loader";
import { NEW_PRINTING_TEMPLATE_ROUTE } from "@/features/printing/routes";

export default function RoutePage() {
  const router = useRouter();

  useEffect(() => {
    router.replace(NEW_PRINTING_TEMPLATE_ROUTE);
  }, [router]);

  return <RouteLoader />;
}
