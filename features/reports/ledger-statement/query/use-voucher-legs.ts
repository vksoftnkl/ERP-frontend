"use client";
/**
 * Every leg of a voucher, for the ▾ expansion and the Alt+F1 popover (§8.5).
 *
 * Rows that arrived with `legs` inline (`withLegs`) need no call. Otherwise
 * the legs are fetched on first use and cached for the session, keyed by
 * ledger AND voucher, because `isThisLedger` depends on the statement's ledger.
 */
import { useCallback, useRef, useState } from "react";
import type { LedgerStatementClient } from "../api/ledger-statement";
import { isAborted } from "../api/abort";
import type { LegsState } from "../grid/grid-model";
import { toLedgerError } from "../wire/errors";
import type { VoucherRow } from "../wire/types";
import type { Session } from "./params";

export function useVoucherLegs(client: LedgerStatementClient, session: Session, ledgerId: string | null) {
  const cache = useRef(new Map<string, LegsState>());
  const [version, setVersion] = useState(0);

  const keyOf = useCallback(
    (row: VoucherRow) => `${session.companyId}|${ledgerId ?? ""}|${row.accYear}|${row.voucherId}`,
    [session.companyId, ledgerId],
  );

  const legsOf = useCallback(
    (row: VoucherRow): LegsState | undefined => {
      if (row.legs) return { status: "ready", legs: row.legs };
      return cache.current.get(keyOf(row));
    },
    // `version` is what makes a fetched result visible to the grid.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [keyOf, version],
  );

  const request = useCallback(
    (row: VoucherRow) => {
      if (row.legs || !ledgerId || !session.companyId) return;
      const key = keyOf(row);
      const held = cache.current.get(key);
      if (held && held.status !== "error") return;
      cache.current.set(key, { status: "loading" });
      setVersion((v) => v + 1);
      client
        .getVoucherLegs({ companyId: session.companyId, accYear: row.accYear, voucherId: row.voucherId, ledgerId })
        .then((payload) => cache.current.set(key, { status: "ready", legs: payload.legs }))
        .catch((error: unknown) => {
          if (isAborted(error)) {
            cache.current.delete(key);
          } else {
            cache.current.set(key, { status: "error", message: toLedgerError(error).message });
          }
        })
        .finally(() => setVersion((v) => v + 1));
    },
    [client, keyOf, ledgerId, session.companyId],
  );

  return { legsOf, request };
}
