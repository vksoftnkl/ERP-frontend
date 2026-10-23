"use client";
import { useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import ModalPortal from "@/components/ui/modal-portal";
import {
  NexDropdownSingle,
  type DropdownSelection,
} from "@/components/design-system/dropdown";
import { confirm } from "@/lib/confirm";
import { useDropdownId } from "@/lib/configured-dropdowns";
import { hasTypedItemEntries } from "./item-card-rules";
import styles from "./item-copy-from-item.module.scss";

type ItemCopyFromItemButtonProps = {
  /** The new item's form as it stands — copying over typed entries asks first. */
  values: Record<string, string>;
  /** Loads the picked item into the form as a NEW item. */
  onCopy: (itemId: string) => Promise<void> | void;
};

/**
 * "Copy from Item" (Qt 54b0eed): start a NEW item from an existing one —
 * everything is copied except the code, the barcodes and the image. Offered on
 * a new item only; the page leaves it out in edit mode. The picker is the item
 * list dropdown ("ITEMS"), the same one Qt's popup and the Qty-wise Price
 * screen use.
 */
export default function ItemCopyFromItemButton({ values, onCopy }: ItemCopyFromItemButtonProps) {
  const itemDropdownId = useDropdownId("item");
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<DropdownSelection | null>(null);
  const [copying, setCopying] = useState(false);

  const start = async () => {
    // Something typed already would be replaced — ask first.
    if (
      hasTypedItemEntries(values) &&
      !(await confirm({
        title: "Copy from item",
        message: "Replace what is on this form with the copied item?",
        confirmLabel: "Replace",
        iconVariant: "replace",
      }))
    ) {
      return;
    }
    setPicked(null);
    setOpen(true);
  };

  const close = () => {
    if (!copying) {
      setOpen(false);
    }
  };

  const copy = async () => {
    if (!picked?.id || copying) {
      return;
    }
    setCopying(true);
    try {
      await onCopy(picked.id);
      setOpen(false);
    } finally {
      setCopying(false);
    }
  };

  // The entry popup underneath listens on window for Escape (close) and its
  // save chords; a key spent here is marked, and that listener skips a marked
  // key. A key the item list already spent (Escape closing its list) is left alone.
  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.defaultPrevented) {
      return;
    }
    const isSaveChord =
      (!event.altKey && !event.shiftKey && (event.ctrlKey || event.metaKey) &&
        (event.key === "Enter" || event.key.toLowerCase() === "s")) ||
      event.key === "F12";
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (isSaveChord) {
      event.preventDefault();
      void copy();
    }
  };

  return (
    <>
      <button
        type="button"
        className={styles.copyButton}
        title="Start this new item from an existing one: everything is copied except the code, barcodes and image."
        onClick={() => void start()}
      >
        Copy from Item
      </button>
      {open ? (
        <ModalPortal>
          <div
            className={styles.overlay}
            role="dialog"
            aria-modal="true"
            aria-label="Copy from item"
            onKeyDown={handleKeyDown}
          >
            <button
              type="button"
              className={styles.backdrop}
              aria-label="Close copy from item"
              disabled={copying}
              onClick={close}
            />
            <div className={styles.panel}>
              <h3 className={styles.title}>Copy from item</h3>
              <label className={styles.label} htmlFor="item-copy-from-item-picker">
                Item to copy:
              </label>
              <NexDropdownSingle
                id="item-copy-from-item-picker"
                dropdownId={itemDropdownId}
                value={picked}
                onChange={(selection) => setPicked(selection)}
                advanceFocusOnSelect
                autoFocus
                disabled={copying}
                placeholder="Search an item"
                aria-label="Item to copy"
              />
              <p className={styles.note}>
                A new item is made from it. The item code, barcodes and image are not copied.
              </p>
              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.actionButton}
                  disabled={copying}
                  onClick={close}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className={`${styles.actionButton} ${styles.primaryButton}`}
                  disabled={!picked?.id || copying}
                  onClick={() => void copy()}
                >
                  {copying ? "Copying…" : "Copy"}
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      ) : null}
    </>
  );
}
