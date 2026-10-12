"use client";

/**
 * `/sales/till-masters` — the old tabbed Till Masters screen, split (Qt
 * d5c3637) into Till Counters, Till Safes, Till Reasons and Denominations
 * under the Till Masters group. A bookmark or a stale menu link lands on the
 * first of them, menu 275, which kept the old screen's id and rights.
 */
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import RouteLoader from "@/components/feedback/route-loader";

export default function RoutePage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/sales/till/counters");
  }, [router]);
  return <RouteLoader />;
}
