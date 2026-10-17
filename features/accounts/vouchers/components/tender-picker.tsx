"use client";

/**
 * A Contra line's tender list — the Qt `openContraTenderMenu` (notes 126 §6).
 *
 * The CASH tenders and each bank's BANK tender, "tender → ledger"; the line
 * posts to the picked tender's ledger. Opened from the Ledger cell where any
 * other type opens the ledger picker: a typed letter (which moves to the
 * first tender starting with it), Enter, F2 or a click. It opens on the
 * line's own tender. ↑/↓ move, a letter jumps, Enter picks, Esc closes.
 */
import { useEffect, useRef, useState } from "react";
import { cx } from "@/components/design-system/cx";
import { ModalShell } from "@/features/sales/quotation/components/modal-shell";
import styles from "@/features/accounts/cheques/cheques.module.scss";
import voucherStyles from "../vouchers.module.scss";
import { contraTenderLabel, openingTenderIndex, tenderAtLetter } from "../domain/contra";
import type { InstrumentTenderRow } from "../vouchers.types";

export type TenderPickerProps = {
  title: string;
  /** The Contra's tenders — `contraTenders`, never empty here. */
  tenders: readonly InstrumentTenderRow[];
  /** The line's own tender, highlighted when the list opens. */
  currentTenderId: string;
  /** The letter typed on the cell that opened it. */
  initialLetter: string;
  onPick: (tenderId: string) => void;
  onClose: () => void;
};

export function TenderPicker(props: TenderPickerProps) {
  const { title, tenders, currentTenderId, initialLetter, onPick, onClose } = props;
  const [active, setActive] = useState(() => openingTenderIndex(tenders, currentTenderId, initialLetter));
  const at = Math.min(active, Math.max(0, tenders.length - 1));
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    listRef.current?.querySelector('[data-current="true"]')?.scrollIntoView({ block: "nearest" });
  }, [at]);

  return (
    <ModalShell title={title} isOpen narrow onClose={onClose}>
      <div
        ref={listRef}
        className={cx(styles.dialogBody, voucherStyles.pickerList, voucherStyles.tenderList)}
        role="listbox"
        aria-label={title}
        aria-activedescendant={tenders[at] ? `tender-${tenders[at].tenderId}` : undefined}
        tabIndex={0}
        // ModalPortal mounts a commit late: autoFocus lands, a timed focus() may not.
        autoFocus
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setActive(Math.min(tenders.length - 1, at + 1));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActive(Math.max(0, at - 1));
          } else if (event.key === "Home" || event.key === "End") {
            event.preventDefault();
            setActive(event.key === "Home" ? 0 : tenders.length - 1);
          } else if (event.key === "Enter") {
            event.preventDefault();
            const tender = tenders[at];
            if (tender) {
              onPick(tender.tenderId);
            }
          } else if (event.key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey) {
            const index = tenderAtLetter(tenders, at, event.key);
            if (index >= 0) {
              event.preventDefault();
              setActive(index);
            }
          }
        }}
      >
        <table className={styles.dialogTable}>
          <tbody>
            {tenders.map((tender, index) => (
              <tr
                key={tender.tenderId}
                id={`tender-${tender.tenderId}`}
                role="option"
                aria-selected={index === at}
                className={`${styles.row} ${index === at ? styles.rowCurrent : ""}`}
                data-current={index === at ? "true" : undefined}
                onMouseDown={() => setActive(index)}
                onClick={() => onPick(tender.tenderId)}
              >
                <td>{contraTenderLabel(tender)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ModalShell>
  );
}
