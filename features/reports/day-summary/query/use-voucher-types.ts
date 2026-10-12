"use client";
/**
 * The Type combo's list: `/voucher-types`, once for the session (plan §4.1).
 * The types are global (the route takes no company), so one list serves
 * every company. A failure is kept so the screen can say so; the combo still
 * offers "All voucher types".
 */
import { useEffect, useState } from "react";
import type { DaySummaryClient } from "../api/day-summary";
import { isAborted } from "@/features/reports/shared/api/abort";
import type { VoucherTypeOption } from "../wire/types";

let cached: VoucherTypeOption[] | null = null;

export function useVoucherTypes(client: DaySummaryClient, enabled: boolean) {
  const [types, setTypes] = useState<VoucherTypeOption[] | null>(cached);
  const [error, setError] = useState<unknown>(null);

  const missing = enabled && types === null && error === null;
  useEffect(() => {
    if (!missing) return;
    const controller = new AbortController();
    client
      .getVoucherTypes(controller.signal)
      .then((list) => {
        cached = list;
        setTypes(list);
      })
      .catch((reason: unknown) => {
        if (!isAborted(reason, controller.signal)) setError(reason);
      });
    return () => controller.abort();
  }, [client, missing]);

  return { types, error };
}
