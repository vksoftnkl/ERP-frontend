"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import masterStyles from "@/app/master/state-master/page.module.scss";
import { ErpActionIcon } from "@/components/design-system/icons/erp-action-icons";
import type { MasterTableRow } from "@/components/master/crud-master-page.types";
import { usePagePermissions } from "@/hooks/useMenuPermissions";
import { ScheduledPricesLauncher } from "@/features/stocks/selling-price/components/scheduled-prices-dialog";
import { QuickRateDialog } from "@/features/stocks/selling-price/components/quick-rate-dialog";
import { txnKeyOf } from "@/lib/txn-keys";
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
 *  - Change rate (Ctrl+R) — the selected item's selling rates, without opening
 *    the item card (QuickRateDialog, notes 146; Qt a204dc8). Read-only without
 *    Edit on Change Selling Price (menu 30); the popup checks that itself.
 * Rendered through the shell's `toolbarActions`, so it gets the selected row.
 */

/** The Item list's menu — the Price Change Log's "via Item list (menu 29)". */
const ITEM_LIST_MENU_ID = 29;
export default function ItemListActions({ row }: { row: MasterTableRow | null }) {
  const router = useRouter();
  const { permissions: qtyPricePermissions } = usePagePermissions({ menuId: ITEM_QTY_PRICE_MENU_ID });
  const canOpenQtyPrice = qtyPricePermissions.canView;
  const [scheduledOpen, setScheduledOpen] = useState(false);
  /** The item the quick rate popup is open on; null while closed. */
  const [rateTarget, setRateTarget] = useState<{ itemId: string; itemName: string } | null>(null);
  const target = itemListRowTarget(row);
  const targetItemId = target?.itemId ?? "";
  const targetItemName = target?.itemName ?? "";

  const openQtyPrice = useCallback(() => {
    if (targetItemId) {
      router.push(itemQtyPriceHref(targetItemId, targetItemName));
    }
  }, [router, targetItemId, targetItemName]);

  const openChangeRate = useCallback(() => {
    if (targetItemId) {
      setRateTarget({ itemId: targetItemId, itemName: targetItemName });
    }
  }, [targetItemId, targetItemName]);

  // F9, Ctrl+Q and Ctrl+R — the Qt keys. Quiet while any dialog is up (an item
  // open in its popup included), so its own keys are not also this list's.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || event.altKey || event.shiftKey) {
        return;
      }
      // Ctrl+R is never the browser's reload on this list.
      const changeRate = txnKeyOf(event) === "changeRate";
      if (changeRate) {
        event.preventDefault();
      }
      if (scheduledOpen || rateTarget || document.querySelector('[role="dialog"][aria-modal="true"]')) {
        return;
      }
      if (changeRate) {
        openChangeRate();
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
  }, [canOpenQtyPrice, openChangeRate, openQtyPrice, rateTarget, scheduledOpen]);

  const closeScheduled = useCallback(() => setScheduledOpen(false), []);
  const closeChangeRate = useCallback(() => setRateTarget(null), []);

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
      <button
        type="button"
        className={`${masterStyles.iconBtn} ${masterStyles.iconBtnEdit} erp-ms-tbtn`}
        title={target ? "Change the selected item's selling rates (Ctrl+R)" : "Highlight an item first."}
        disabled={!target}
        onClick={openChangeRate}
      >
        <span className={`${masterStyles.iconBtnBox} erp-ms-tbtn-icon`}>
          <ErpActionIcon name="edit" />
        </span>
        <span>Change rate</span>
      </button>
      {scheduledOpen ? <ScheduledPricesLauncher onClose={closeScheduled} /> : null}
      {rateTarget ? (
        <QuickRateDialog
          itemId={rateTarget.itemId}
          itemName={rateTarget.itemName}
          originMenuId={ITEM_LIST_MENU_ID}
          onClose={closeChangeRate}
          onSaved={() => undefined}
        />
      ) : null}
    </>
  );
}
