"use client";

/**
 * The Customer master, opened over a customer dropdown by Alt+C / Alt+A.
 *
 * It is the master screen itself — the same form, the same validation, the same
 * related-master modals behind State, Area and Customer Group — mounted with its
 * list suppressed. Nothing about the customer form is restated here, because a
 * second, shorter customer form is a second answer to "what does a customer
 * need", and the two would drift.
 *
 * The bridge this file provides is small and is all of it: turn the registry's
 * `{ mode, selectionId, query }` into the controller call that opens the right
 * modal, and turn the save back into `{ id, text }` so the field that asked can
 * select the record that was just created.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import type { CrudMasterPageController } from "@/components/master/crud-master-page";
import type { DropdownMasterEntryProps } from "@/components/design-system/dropdown/masters";

import CustomerPage from "./page";

export default function InlineCustomerMaster({
  mode,
  selectionId,
  query,
  onSaved,
  onClose,
}: DropdownMasterEntryProps) {
  /**
   * The FIRST controller and only that one.
   *
   * `CrudMasterPage` re-announces its controller on every render — the object is
   * rebuilt each time — so storing each announcement would re-render for ever.
   * What is wanted from it is only "the master is ready", which the first one
   * already says.
   */
  const [controller, setController] = useState<CrudMasterPageController | null>(null);
  const handleControllerReady = useCallback((next: CrudMasterPageController | null) => {
    if (next) {
      setController((current) => current ?? next);
    }
  }, []);

  const openedRef = useRef(false);
  const savedRef = useRef(false);

  /**
   * Opening is deferred by a timeout, and that is not a paper-over.
   *
   * `openUpdateById` reads the record through an RTK Query LAZY trigger, and a
   * lazy trigger fired while its own screen is still mounting has no
   * subscription behind it yet: the request goes out and is aborted as React
   * tears the first mount down, so the form opens on a blank record with nothing
   * to say why. `use-quotation-draft` documents the same trap and dodges it by
   * dispatching `initiate` directly — not available here, because the fetch
   * belongs to the master screen rather than to this file.
   *
   * The cleanup is what makes this correct rather than lucky: React's
   * development double-mount cancels the first attempt outright, so the request
   * is only ever issued by the mount that survives it.
   */
  useEffect(() => {
    if (!controller || openedRef.current) {
      return;
    }
    const timer = window.setTimeout(() => {
      openedRef.current = true;
      if (mode === "create") {
        const typed = query.trim();
        // Whatever was keyed into the field was the operator looking for this
        // customer by name, so it is the name the form starts on. Upper-cased to
        // match what the global capitalization rule would have done to it had it
        // been typed into the form itself.
        controller.openCreate({
          values: typed ? { cusName: typed.toUpperCase() } : undefined,
        });
        return;
      }
      if (selectionId) {
        void controller.openUpdateById(selectionId);
      }
    }, 0);
    return () => {
      window.clearTimeout(timer);
    };
  }, [controller, mode, query, selectionId]);

  /**
   * Closing without saving is the operator changing their mind, and the field
   * goes back to what it was showing. A close that FOLLOWS a save is the save's
   * own — `onSaved` has already told the field what to select, and reporting a
   * cancel after it would be a second, contradictory answer.
   */
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
    ({ customerId, customerName }: { customerId: string; customerName: string }) => {
      savedRef.current = true;
      onSaved({ id: customerId, text: customerName });
    },
    [onSaved],
  );

  return (
    <CustomerPage
      inlineModalOnly
      onCrudControllerReady={handleControllerReady}
      onModalOpenChange={handleModalOpenChange}
      onCustomerSaved={handleCustomerSaved}
    />
  );
}
