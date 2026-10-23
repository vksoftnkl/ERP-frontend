"use client";
import { forwardRef, useRef } from "react";
import { toast } from "@/lib/notify";
import { sellingPriceApi } from "@/features/stocks/selling-price/selling-price.api";
import styles from "./item-qty-price.module.scss";

type BarcodeInputFieldProps = {
  value: string;
  onChange: (value: string) => void;
  /** The header's company: a scan resolves within it (the EAN table is per company). */
  companyId: string;
  onResolved: (itemId: string, itemName: string) => void;
};

// The text field a barcode scanner types into and ends with Enter. A scan
// resolves to its item (Qt onBarcodeEntered) and the code stays in the box —
// the item box shows the item; picking a name there empties this one.
export const BarcodeInputField = forwardRef<HTMLInputElement, BarcodeInputFieldProps>(
  function BarcodeInputField({ value, onChange, companyId, onResolved }, ref) {
    // Change Selling Price's company-scoped lookup: unscoped, a scan resolves
    // across companies.
    const [triggerBarcode] = sellingPriceApi.useLazyGetSellingPriceItemByBarcodeQuery();
    const busyRef = useRef(false);

    async function handleSubmit() {
      const code = value.trim();
      if (!code || busyRef.current) return;
      busyRef.current = true;
      const notFound = () => toast.info(`No item has barcode ${code}.`, { title: "Barcode" });
      try {
        const result = await triggerBarcode({ barcode: code, companyId }, false).unwrap();
        if (!result.itemId) {
          notFound();
          return;
        }
        onResolved(result.itemId, result.itemName);
      } catch (error) {
        if ((error as { status?: unknown } | null)?.status === 404) {
          notFound();
        } else {
          toast.apiError(error);
        }
      } finally {
        busyRef.current = false;
      }
    }

    return (
      <input
        ref={ref}
        id="iqp-barcode"
        type="text"
        className={styles.fieldInput}
        value={value}
        placeholder="Scan or type a barcode, Enter"
        autoComplete="off"
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.ctrlKey && !event.metaKey) {
            event.preventDefault();
            void handleSubmit();
          }
        }}
      />
    );
  },
);
