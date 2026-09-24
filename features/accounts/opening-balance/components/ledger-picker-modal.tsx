"use client";

/**
 * The ledger picker — configured grid 107, "POPUP - LEDGERS", opened from the
 * Ledger cell of the grid's trailing blank row.
 *
 * There is no Add button on this screen. A ledger joins the set the way an item
 * joins a quotation: by being picked into the blank row that always waits at the
 * bottom.
 *
 * The grid's own SQL restricts to `acc_group_nature IN ('Assets','Liabilities')`,
 * so only balance-sheet ledgers are ever offered. **The React code adds no
 * nature filter of its own** — an opening on "Sales Account" is a category
 * error, not an empty field, and the one place that rule lives is the SQL.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import ModalPortal from "@/components/ui/modal-portal";
import { useSearchPickerLedgersQuery, type LedgerPickerRow } from "@/store/api/openingBalanceApi";
import type { PickedLedger } from "../state/draft";
import styles from "../page.module.scss";

const PAGE_SIZE = 20;

/**
 * Mounted only while it is open, and KEYED by the row it was opened on — so the
 * search box, the page and the highlight start fresh every time without an
 * effect that resets four pieces of state on the render after the open.
 */
export type LedgerPickerModalProps = {
  companyId: string;
  /** Ledgers already on the grid — shown struck through, and refused on pick. */
  usedLedgerIds: readonly string[];
  onClose: () => void;
  onPick: (ledger: PickedLedger) => void;
};

/** `bill_wise` is the SQL's CASE: any non-empty string means true. */
function isBillWise(row: LedgerPickerRow): boolean {
  return (row.bill_wise ?? "").trim() !== "";
}

export function LedgerPickerModal(props: LedgerPickerModalProps) {
  const { companyId, usedLedgerIds, onClose, onPick } = props;
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(1);
  const [activeIndex, setActiveIndex] = useState(0);
  const searchRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => searchRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebounced(search);
      setPage(1);
      setActiveIndex(0);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  const { data, isFetching } = useSearchPickerLedgersQuery({
    companyId,
    search: debounced,
    page,
    limit: PAGE_SIZE,
  });

  const rows = useMemo<LedgerPickerRow[]>(() => data?.items ?? [], [data]);
  const total = data?.meta.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const used = useMemo(() => new Set(usedLedgerIds), [usedLedgerIds]);

  const choose = (row: LedgerPickerRow) => {
    onPick({
      ledId: row.led_id,
      ledName: row.led_name,
      groupName: row.acc_group_name ?? "",
      groupNature: row.acc_group_nature ?? "",
      isBillWise: isBillWise(row),
    });
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => Math.min(rows.length - 1, current + 1));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => Math.max(0, current - 1));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const row = rows[activeIndex];
      if (row) {
        choose(row);
      }
    }
  };

  return (
    <ModalPortal>
      <div className={styles.modalOverlay} role="presentation">
        <div className={styles.modalBackdrop} onClick={onClose} />
        <div
          className={styles.modalPanel}
          role="dialog"
          aria-modal="true"
          aria-label="Select ledger"
          onKeyDown={onKeyDown}
        >
          <header className={styles.modalHead}>
            <h2 className={styles.modalTitle}>Select ledger</h2>
            <button type="button" className={styles.modalClose} onClick={onClose} aria-label="Close">
              ×
            </button>
          </header>

          <div className={styles.modalSearch}>
            <input
              ref={searchRef}
              className={styles.modalSearchInput}
              value={search}
              placeholder="Ledger or group name"
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          <div className={styles.modalBody}>
            <table className={styles.pickerTable}>
              <thead>
                <tr>
                  <th>Ledger</th>
                  <th>Group</th>
                  <th>Nature</th>
                  <th>Bill-wise</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr
                    key={row.led_id}
                    className={`${index === activeIndex ? styles.pickerRowActive : ""} ${
                      used.has(row.led_id) ? styles.pickerRowUsed : ""
                    }`}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => choose(row)}
                  >
                    <td>{row.led_name}</td>
                    <td>{row.acc_group_name ?? ""}</td>
                    <td>{row.acc_group_nature ?? ""}</td>
                    <td>{isBillWise(row) ? "Bill-wise" : ""}</td>
                  </tr>
                ))}
                {rows.length === 0 && !isFetching ? (
                  <tr>
                    <td colSpan={4} className={styles.pickerEmpty}>
                      No balance-sheet ledger matches that.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <footer className={styles.modalFoot}>
            <span className={styles.modalNote}>
              {isFetching ? "Searching…" : `${total} ledger(s) · page ${page} of ${pageCount}`}
            </span>
            <span className={styles.modalFootActions}>
              <button
                type="button"
                className={styles.secondaryButton}
                disabled={page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                Previous
              </button>
              <button
                type="button"
                className={styles.secondaryButton}
                disabled={page >= pageCount}
                onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
              >
                Next
              </button>
              <button type="button" className={styles.secondaryButton} onClick={onClose}>
                Cancel
              </button>
            </span>
          </footer>
        </div>
      </div>
    </ModalPortal>
  );
}
