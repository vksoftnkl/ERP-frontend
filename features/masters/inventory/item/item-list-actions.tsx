"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import masterStyles from "@/app/master/state-master/page.module.scss";
import { ErpActionIcon } from "@/components/design-system/icons/erp-action-icons";
import type { MasterTableRow } from "@/components/master/crud-master-page.types";
import { usePagePermissions } from "@/hooks/useMenuPermissions";
import { ScheduledPricesLauncher } from "@/features/stocks/selling-price/components/scheduled-prices-dialog";
import {
  ITEM_QTY_PRICE_MENU_ID,
  itemQtyPriceHref,
} from "@/features/masters/inventory/item-qty-price/item-qty-price.utils";
import { itemListRowTarget } from "./item-card-rules";

/**
 * The Item Master list's own buttons (Qt item_list, 4ae6575):
 *  - Qty price (Ctrl+Q) — the selected item's Qty-wise prices, on that screen
 *    (menu 244). Only for a user who may open it (View on 244); its Save then
 *    follows 244's own Create / Edit there.
 *  - Scheduled (F9) — every price Change Selling Price set to start on a later
 *    day, for this branch (not just the selected item, as in Qt). Cancelling one
 *    needs the Edit right on Change Selling Price; the list checks that itself.
 * Rendered through the shell's `toolbarActions`, so it gets the selected row.
 */
export default function ItemListActions({ row }: { row: MasterTableRow | null }) {
  const router = useRouter();
  const { permissions: qtyPricePermissions } = usePagePermissions({ menuId: ITEM_QTY_PRICE_MENU_ID });
  const canOpenQtyPrice = qtyPricePermissions.canView;
  const [scheduledOpen, setScheduledOpen] = useState(false);
  const target = itemListRowTarget(row);
  const targetItemId = target?.itemId ?? "";
  const targetItemName = target?.itemName ?? "";

  const openQtyPrice = useCallback(() => {
    if (targetItemId) {
      router.push(itemQtyPriceHref(targetItemId, targetItemName));
    }
  }, [router, targetItemId, targetItemName]);

  // F9 and Ctrl+Q — the Qt keys. Quiet while any dialog is up (an item open in
  // its popup included), so its own keys are not also this list's.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || event.altKey || event.shiftKey) {
        return;
      }
      if (scheduledOpen || document.querySelector('[role="dialog"][aria-modal="true"]')) {
        return;
      }
      if (event.key === "F9" && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        setScheduledOpen(true);
      } else if (
        canOpenQtyPrice &&
        event.key.toLowerCase() === "q" &&
        (event.ctrlKey || event.metaKey)
      ) {
        event.preventDefault();
        openQtyPrice();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [canOpenQtyPrice, openQtyPrice, scheduledOpen]);

  const closeScheduled = useCallback(() => setScheduledOpen(false), []);

  return (
    <>
      <span className="erp-ms-tsep" aria-hidden="true" />
      {canOpenQtyPrice ? (
        <button
          type="button"
          className={`${masterStyles.iconBtn} ${masterStyles.iconBtnShipping} erp-ms-tbtn`}
          title={
            target
              ? "Qty-wise prices of the selected item — buy more, pay less per unit (Ctrl+Q)"
              : "Highlight an item first."
          }
          disabled={!target}
          onClick={openQtyPrice}
        >
          <span className={`${masterStyles.iconBtnBox} erp-ms-tbtn-icon`}>
            <ErpActionIcon name="excel" />
          </span>
          <span>Qty price</span>
        </button>
      ) : null}
      <button
        type="button"
        className={`${masterStyles.iconBtn} ${masterStyles.iconBtnHistory} erp-ms-tbtn`}
        title="Scheduled prices — new prices set to start on a later day (F9)"
        onClick={() => setScheduledOpen(true)}
      >
        <span className={`${masterStyles.iconBtnBox} erp-ms-tbtn-icon`}>
          <ErpActionIcon name="history" />
        </span>
        <span>Scheduled</span>
      </button>
      {scheduledOpen ? <ScheduledPricesLauncher onClose={closeScheduled} /> : null}
    </>
  );
}
