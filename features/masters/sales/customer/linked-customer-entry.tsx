"use client";

/**
 * The Customer entry form, opened over another master to make an existing party
 * ledger a customer as well — the supplier form's "Also a Customer" (server
 * notes 81; the Qt `PartyRoleLink`).
 *
 * Like `inline-customer-master.tsx` it is the master screen itself mounted with
 * its list suppressed, so the form, its validation and its related-master
 * modals are the real ones. What this file adds is the link: the create form
 * opens on the ledger's details, `CustomerPage` locks the name and sends
 * `cusLinkLedId`, and the save is reported back by id.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { CrudMasterPageController } from "@/components/master/crud-master-page";
import type { LedgerPrefill } from "@/features/masters/shared/party-role-link";

import CustomerPage from "./page";

export type LinkedCustomerEntryProps = {
  /** The party ledger's id — the supplier's id, and the customer's to be. */
  ledgerId: string;
  /** The ledger as customer form values (`prefillFromLedger(…, "customer")`). */
  prefill: LedgerPrefill;
  onSaved: (customerId: string) => void;
  /** Closed without saving. */
  onClose: () => void;
};

export default function LinkedCustomerEntry({
  ledgerId,
  prefill,
  onSaved,
  onClose,
}: LinkedCustomerEntryProps) {
  // The FIRST controller only: `CrudMasterPage` re-announces a rebuilt one on
  // every render (see inline-customer-master.tsx).
  const [controller, setController] = useState<CrudMasterPageController | null>(null);
  const handleControllerReady = useCallback((next: CrudMasterPageController | null) => {
    if (next) {
      setController((current) => current ?? next);
    }
  }, []);

  const openedRef = useRef(false);
  const savedRef = useRef(false);

  // Deferred a tick for the same reason as inline-customer-master.tsx: the
  // screen's own mount effects must settle first, and the cleanup cancels the
  // attempt React's development double-mount throws away.
  useEffect(() => {
    if (!controller || openedRef.current) {
      return;
    }
    const timer = window.setTimeout(() => {
      openedRef.current = true;
      controller.openCreate({ values: prefill.values });
    }, 0);
    return () => {
      window.clearTimeout(timer);
    };
  }, [controller, prefill.values]);

  // A close that follows a save is the save's own; only a close without one is
  // the operator changing their mind.
  const handleModalOpenChange = useCallback(
    (open: boolean) => {
      if (open || savedRef.current) {
        return;
      }
      onClose();
    },
    [onClose],
  );

  const handleCustomerSaved = useCallback(
    ({ customerId }: { customerId: string }) => {
      savedRef.current = true;
      onSaved(customerId);
    },
    [onSaved],
  );

  const linkLedger = useMemo(
    () => ({ ledgerId, values: prefill.values, labels: prefill.labels }),
    [ledgerId, prefill.labels, prefill.values],
  );

  return (
    <CustomerPage
      inlineModalOnly
      linkLedger={linkLedger}
      onCrudControllerReady={handleControllerReady}
      onModalOpenChange={handleModalOpenChange}
      onCustomerSaved={handleCustomerSaved}
    />
  );
}
