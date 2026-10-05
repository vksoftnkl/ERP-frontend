"use client";

/**
 * The Ledger cell's picker — the ledgers a line on THIS side may use.
 *
 * `/vouchers/ledger-pick` applies the type's side groups (for Contra: Cash-in-
 * Hand, Bank Accounts, Bank OD A/c and their sub-groups) and leaves out the
 * instrument-controlled ledgers (Cheques In Hand, a card or UPI clearing
 * ledger) — the same filter the Qt popup's grid 119 runs. The search is the
 * server's loose one, on name and alias.
 *
 * Opened by a typed character (which seeds the search), Enter, F2 or a click
 * on the cell. ↑/↓ move, Enter picks, Esc closes.
 *
 * It also picks a ONE-party type's header party: the same route on the
 * party's side, kept to party ledgers (Sundry Debtors / Creditors) — the
 * Qt dropdown 59 does the same, but lives only on the dev database, and the
 * server itself would accept any ledger of the side's groups (a note's party
 * side has none). On the typed lines the header party is left out: it is the
 * server's leg.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { cx } from "@/components/design-system/cx";
import { ModalShell } from "@/features/sales/quotation/components/modal-shell";
import { usePickVoucherLedgersQuery, type LedgerPickRow } from "@/store/api/vouchersApi";
import { chequeError } from "@/features/accounts/cheques/api-errors";
import styles from "@/features/accounts/cheques/cheques.module.scss";
import voucherStyles from "../vouchers.module.scss";
import type { DrCr } from "../vouchers.types";

const SEARCH_DEBOUNCE_MS = 250;

export type LedgerPickerProps = {
  companyId: string;
  branchId: string;
  typeCode: string;
  typeName: string;
  side: DrCr;
  initialSearch: string;
  /** The header party: party ledgers only. */
  partiesOnly?: boolean;
  /** Left out of the list — a one-party type's header party, on its lines. */
  excludeLedgerId?: string;
  title?: string;
  onPick: (ledger: LedgerPickRow) => void;
  onClose: () => void;
};

export function LedgerPicker(props: LedgerPickerProps) {
  const { companyId, branchId, typeCode, typeName, side, initialSearch, partiesOnly, excludeLedgerId, title, onPick, onClose } =
    props;
  const [text, setText] = useState(initialSearch);
  const [search, setSearch] = useState(initialSearch);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(text), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [text]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const input = inputRef.current;
      if (input) {
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const { currentData, isFetching, error } = usePickVoucherLedgersQuery(
    // The party list is filtered here, so it asks for the route's most.
    { companyId, branchId, typeCode, side, q: search, limit: partiesOnly ? 500 : 100 },
    { refetchOnMountOrArgChange: true },
  );
  const rows = useMemo(
    () =>
      (currentData ?? []).filter(
        (row) => (!partiesOnly || row.isParty) && (!excludeLedgerId || row.ledId !== excludeLedgerId),
      ),
    [currentData, excludeLedgerId, partiesOnly],
  );
  const at = Math.min(active, Math.max(0, rows.length - 1));
  const listRef = useRef<HTMLDivElement | null>(null);

  // The list scrolls inside a panel of one height, so the cursor the arrow
  // keys move must follow it into view.
  useEffect(() => {
    listRef.current?.querySelector('[data-current="true"]')?.scrollIntoView({ block: "nearest" });
  }, [at]);

  return (
    <ModalShell
      title={title ?? `Ledger — ${side === "DR" ? "debit" : "credit"} side of ${typeName}`}
      isOpen
      wide
      fixedHeight
      onClose={onClose}
    >
      <div
        className={cx(styles.dialogBody, voucherStyles.pickerBody)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setActive(Math.min(rows.length - 1, at + 1));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActive(Math.max(0, at - 1));
          } else if (event.key === "Enter") {
            event.preventDefault();
            const row = rows[at];
            if (row) {
              onPick(row);
            }
          }
        }}
      >
        <input
          ref={inputRef}
          className={styles.input}
          value={text}
          data-uppercase="off"
          placeholder="ledger name or alias"
          onChange={(event) => {
            setText(event.target.value);
            setActive(0);
          }}
        />
        {error ? <p className={styles.dialogError}>{chequeError(error)}</p> : null}
        <div ref={listRef} className={voucherStyles.pickerList}>
          <table className={styles.dialogTable}>
            <thead>
              <tr>
                <th>Ledger</th>
                <th>Group</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={2} className={styles.emptyCell}>
                    {isFetching ? "Reading…" : partiesOnly ? "No party on this side matches." : "No ledger on this side matches."}
                  </td>
                </tr>
              ) : null}
              {rows.map((row, index) => (
                <tr
                  key={row.ledId}
                  className={`${styles.row} ${index === at ? styles.rowCurrent : ""}`}
                  data-current={index === at ? "true" : undefined}
                  onMouseDown={() => setActive(index)}
                  onDoubleClick={() => onPick(row)}
                  onClick={() => onPick(row)}
                >
                  <td>{row.name}</td>
                  <td>{row.groupName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </ModalShell>
  );
}
