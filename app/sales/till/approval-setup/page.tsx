"use client";

/**
 * `/sales/till/approval-setup` — the old two-tab Till Approval Setup, split
 * (Qt a449b8c, server notes 111) into Till Approval Rules (276, which kept the
 * id and rights) and Till Approval Authority (285). A bookmark or a stale menu
 * link lands on the rules.
 */
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import RouteLoader from "@/components/feedback/route-loader";

export default function RoutePage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/sales/till/approval-rules");
  }, [router]);
  return <RouteLoader />;
}
