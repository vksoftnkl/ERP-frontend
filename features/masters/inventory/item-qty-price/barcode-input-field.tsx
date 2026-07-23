"use client";
import { useEffect, useRef, useState } from "react";
import { toast } from "react-toastify";
import { extractApiErrorMessage } from "@/lib/api/client";
import { useLazyGetItemByBarcodeQuery } from "@/store/api/lookupsApi";
import styles from "./item-qty-price.module.scss";

type BarcodeInputFieldProps = {
  onResolved: (itemId: string, itemLabel: string, unitId: string) => void;
};

// Plain text field a barcode scanner types into and terminates with Enter.
// On resolve it clears itself so the next scan can go straight in.
export function BarcodeInputField({ onResolved }: BarcodeInputFieldProps) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const shouldRefocusRef = useRef(false);
  const [triggerBarcode, { isFetching }] = useLazyGetItemByBarcodeQuery();

  // Disabling the field while the lookup runs blurs it, which would send the
  // next scan nowhere — put the caret back once it re-enables, but only for a
  // scan this field actually started.
  useEffect(() => {
    if (isFetching || !shouldRefocusRef.current) return;
    shouldRefocusRef.current = false;
    inputRef.current?.focus();
  }, [isFetching]);

  async function handleSubmit() {
    const code = value.trim();
    if (!code || isFetching) return;
    shouldRefocusRef.current = true;
    try {
      const result = await triggerBarcode({ barcode: code }, true).unwrap();
      onResolved(result.itemId, result.itemName, result.unitId);
    } catch (error) {
      toast.error(extractApiErrorMessage(error, `No item found for barcode ${code}`));
    } finally {
      setValue("");
    }
  }

  return (
    <input
      ref={inputRef}
      type="text"
      className={styles.cellInput}
      value={value}
      placeholder="Scan or enter barcode"
      autoComplete="off"
      disabled={isFetching}
      onChange={(event) => setValue(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          void handleSubmit();
        }
      }}
    />
  );
}
