"use client";

/**
 * "Also a Customer" on a saved supplier's form — the Qt
 * `PartyRoleLink::installFooterAction` (server notes 81).
 *
 * A supplier's id IS its ledger's id, and a customer row may share it: one
 * party, one balance, sales and purchases netting on the same account. The
 * button appears once `GET /customers/get?cusId=<supId>` answers 404 (the party
 * is not a customer yet) and only for a user who may add customers. Clicking
 * it reads the ledger and opens the Customer entry form over this one,
 * prefilled from the ledger, with the name locked and `cusLinkLedId` on the
 * save. Once that save lands the button goes away.
 */

import { useCallback, useEffect, useState, type ReactNode } from "react";
import axios from "axios";
import dynamic from "next/dynamic";

import { useApi } from "@/hooks/useApi";
import { usePagePermissions } from "@/hooks/useMenuPermissions";
import { toast } from "@/lib/notify";
import {
  LEDGER_GET_ENDPOINT,
  PARTY_ROLE_INFO,
  extractLedgerRecord,
  prefillFromLedger,
  type LedgerPrefill,
} from "@/features/masters/shared/party-role-link";

import styles from "./also-customer.module.scss";

// The customer screen is large and only needed once the button is pressed.
const LinkedCustomerEntry = dynamic(
  () => import("@/features/masters/sales/customer/linked-customer-entry"),
  { ssr: false },
);

const CUSTOMER = PARTY_ROLE_INFO.customer;

/** offer: not a customer yet — show the button. Anything else: hide it. */
type ProbeStatus = "offer" | "linked" | "unknown";

type LinkedEntry = { ledgerId: string; prefill: LedgerPrefill };

export type UseAlsoCustomerResult = {
  /** For `modalFooterLeadingActions`; null when the button is not offered. */
  renderFooterAction: (variantKey: string) => ReactNode;
  /** The customer form while it is open over the supplier's; else null. */
  linkedEntry: ReactNode;
};

/**
 * @param supplierId the supplier open in the update modal, or null when the
 *   modal is closed or on a new / viewed record.
 */
export function useAlsoCustomer(supplierId: string | null): UseAlsoCustomerResult {
  const { permissions } = usePagePermissions({ href: CUSTOMER.href });
  const canCreateCustomer = permissions.canCreate;

  // Two hooks: useApi aborts its own previous request, and the probe of one
  // supplier must not cancel the ledger read of another.
  const { getAll: probeCustomer } = useApi<unknown>(CUSTOMER.getEndpoint, {
    toast: { error: false, success: false },
  });
  const { getAll: getLedger } = useApi<unknown>(LEDGER_GET_ENDPOINT, {
    toast: { success: false },
  });

  // The answer is kept with the supplier it is about, so one about a supplier
  // no longer open never shows the button for the next one.
  const [probe, setProbe] = useState<{ supplierId: string; status: ProbeStatus } | null>(null);
  const status =
    supplierId && canCreateCustomer && probe?.supplierId === supplierId ? probe.status : null;
  const [loadingLedger, setLoadingLedger] = useState(false);
  const [entry, setEntry] = useState<LinkedEntry | null>(null);

  useEffect(() => {
    if (!supplierId || !canCreateCustomer) {
      return;
    }
    let cancelled = false;
    void (async () => {
      let next: ProbeStatus;
      try {
        const response = await probeCustomer({ [CUSTOMER.idKey]: supplierId });
        // undefined: superseded by a newer probe, which will answer instead.
        if (response === undefined) {
          return;
        }
        next = "linked";
      } catch (error) {
        // 404 = not that role yet. Any other failure says nothing either way,
        // so the button stays away rather than offer a link that may 409.
        next =
          axios.isAxiosError(error) && error.response?.status === 404 ? "offer" : "unknown";
      }
      if (!cancelled) {
        setProbe({ supplierId, status: next });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canCreateCustomer, probeCustomer, supplierId]);

  const handleOpen = useCallback(async () => {
    if (!supplierId || loadingLedger) {
      return;
    }
    setLoadingLedger(true);
    try {
      const response = await getLedger({ ledId: supplierId });
      if (response === undefined) {
        return;
      }
      const ledger = extractLedgerRecord(response);
      if (!ledger) {
        toast.warning("This supplier's account ledger could not be read.");
        return;
      }
      setEntry({ ledgerId: supplierId, prefill: prefillFromLedger(ledger, "customer") });
    } catch {
      // useApi has already shown the server's message.
    } finally {
      setLoadingLedger(false);
    }
  }, [getLedger, loadingLedger, supplierId]);

  const handleSaved = useCallback((customerId: string) => {
    setEntry(null);
    setProbe({ supplierId: customerId, status: "linked" });
  }, []);
  const handleClose = useCallback(() => {
    setEntry(null);
  }, []);

  const renderFooterAction = useCallback(
    (variantKey: string): ReactNode => {
      if (variantKey !== "master-update" || status !== "offer") {
        return null;
      }
      return (
        <button
          // Never `submit`: this opens another master's form; it does not save
          // the supplier.
          type="button"
          className={styles.alsoButton}
          disabled={loadingLedger || entry !== null}
          title="Make this party a customer as well, on the same ledger: one balance, sales and purchases set off against each other."
          onClick={() => {
            void handleOpen();
          }}
        >
          Also a {CUSTOMER.label}
        </button>
      );
    },
    [entry, handleOpen, loadingLedger, status],
  );

  const linkedEntry = entry ? (
    <LinkedCustomerEntry
      ledgerId={entry.ledgerId}
      prefill={entry.prefill}
      onSaved={handleSaved}
      onClose={handleClose}
    />
  ) : null;

  return { renderFooterAction, linkedEntry };
}
