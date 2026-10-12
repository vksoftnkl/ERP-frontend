"use client";

/** The tenders a statement can be for (Qt loadTenders), read when a dialog opens. */
import { useEffect, useState } from "react";
import { toast } from "@/lib/notify";
import type { SettlementClient } from "../api/settlement-api";
import { settlementErrorMessage } from "../domain/errors";
import { settlementTenders, type SettlementTender } from "../domain/tenders";

export function useSettlementTenders(client: SettlementClient, companyId: string) {
  const [state, setState] = useState<{ tenders: SettlementTender[]; loading: boolean }>({
    tenders: [],
    loading: true,
  });

  useEffect(() => {
    let live = true;
    client
      .tenders()
      .then((rows) => {
        if (live) setState({ tenders: settlementTenders(rows, companyId), loading: false });
      })
      .catch((failure: unknown) => {
        if (!live) return;
        setState({ tenders: [], loading: false });
        toast.error(settlementErrorMessage(failure));
      });
    return () => {
      live = false;
    };
  }, [client, companyId]);

  return state;
}
