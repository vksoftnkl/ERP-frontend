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

import { useCallback, useState, type ReactNode } from "react";
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
export function useAlsoCustomer(
  supplierId: string | null,
  /**
   * The shared "is it a customer too?" answer from `usePartyOtherRole` for
   * `supplierId` (false = not a customer yet, true = already one, null =
   * unknown). One probe of `/customers/get` serves both the button and the
   * shared-party note; probing twice put two 404s in the console per edit.
   */
  isCustomer: boolean | null,
  /** Called once the linked customer is saved, so the shared answer flips. */
  onLinked: (customerId: string) => void,
): UseAlsoCustomerResult {
  const { permissions } = usePagePermissions({ href: CUSTOMER.href });
  const canCreateCustomer = permissions.canCreate;

  const { getAll: getLedger } = useApi<unknown>(LEDGER_GET_ENDPOINT, {
    toast: { success: false },
  });

  // 404 = not that role yet: offer the button. Any other failure says nothing
  // either way, so the button stays away rather than offer a link that may 409.
  const status: ProbeStatus | null =
    supplierId && canCreateCustomer
      ? isCustomer === false
        ? "offer"
        : isCustomer === true
          ? "linked"
          : "unknown"
      : null;
  const [loadingLedger, setLoadingLedger] = useState(false);
  const [entry, setEntry] = useState<LinkedEntry | null>(null);

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

  const handleSaved = useCallback(
    (customerId: string) => {
      setEntry(null);
      onLinked(customerId);
    },
    [onLinked],
  );
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
