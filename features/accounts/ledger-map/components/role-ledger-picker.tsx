"use client";

/**
 * The ledger picker — configured grid 105, "POPUP - LEDGERS FOR ROLE", opened
 * from a row's Ledger cell.
 *
 * The picker is filtered BY ROLE: the grid's SQL applies the role's wanted
 * type, duty head and group nature, and offers only live, global ledgers. So
 * the React code adds no filter of its own — the one place that rule lives is
 * the SQL, and the local type check in `domain.fitsLocally` is only a backstop
 * for the day the two drift apart.
 *
 * Mounted only while open and keyed by the role, so the search, the page and
 * the highlight start fresh every time.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import ModalPortal from "@/components/ui/modal-portal";
import { useSearchRoleLedgersQuery } from "@/store/api/ledgerMapApi";
import { needsLabel } from "../domain";
import type { LedgerMapRow, PickedLedger, RoleLedgerPickerRow } from "../ledger-map.types";
import styles from "../page.module.scss";

const PAGE_SIZE = 20;

export type RoleLedgerPickerProps = {
  row: LedgerMapRow;
  /** The keystroke that opened it from the cell — the start of the search. */
  initialSearch: string;
  onClose: () => void;
  onPick: (ledger: PickedLedger) => void;
};

export function RoleLedgerPicker({ row, initialSearch, onClose, onPick }: RoleLedgerPickerProps) {
  const [search, setSearch] = useState(initialSearch);
  const [debounced, setDebounced] = useState(initialSearch);
  const [page, setPage] = useState(1);
  const [activeIndex, setActiveIndex] = useState(0);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  /** Where the pointer last was, to tell a real move from a row sliding under it. */
  const pointerRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (search === debounced) {
      return;
    }
    const timer = window.setTimeout(() => {
      setDebounced(search);
      setPage(1);
      setActiveIndex(0);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [search, debounced]);

  const { data, isFetching, isError } = useSearchRoleLedgersQuery({
    role: row.role,
    search: debounced,
    page,
    limit: PAGE_SIZE,
  });

  const items = useMemo<RoleLedgerPickerRow[]>(() => data?.items ?? [], [data]);
  const total = data?.meta.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // The list scrolls inside the panel, so the row the arrows move to has to be
  // brought into view.
  useEffect(() => {
    bodyRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, items]);

  /**
   * The mouse takes the highlight only when it MOVES — `mouseenter` also fires
   * when a row slides under a resting pointer, which would steal the highlight
   * straight back from the arrow keys.
   */
  const onRowMouseMove = (event: React.MouseEvent, index: number) => {
    const last = pointerRef.current;
    pointerRef.current = { x: event.clientX, y: event.clientY };
    if (!last || (last.x === event.clientX && last.y === event.clientY)) {
      return;
    }
    if (index !== activeIndex) {
      setActiveIndex(index);
    }
  };

  const turnPage = (to: number) => {
    setPage(to);
    setActiveIndex(0);
  };

  const choose = (item: RoleLedgerPickerRow) => {
    onPick({
      ledgerId: item.led_id,
      ledgerName: item.led_name,
      ledgerType: item.led_ledger_type ?? "",
    });
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    switch (event.key) {
      case "Escape":
        event.preventDefault();
        onClose();
        return;
      case "ArrowDown":
        event.preventDefault();
        setActiveIndex((current) => Math.max(0, Math.min(items.length - 1, current + 1)));
        return;
      case "ArrowUp":
        event.preventDefault();
        setActiveIndex((current) => Math.max(0, current - 1));
        return;
      case "PageDown":
        event.preventDefault();
        if (page < pageCount) {
          turnPage(page + 1);
        }
        return;
      case "PageUp":
        event.preventDefault();
        if (page > 1) {
          turnPage(page - 1);
        }
        return;
      case "Enter": {
        event.preventDefault();
        const item = items[activeIndex];
        if (item) {
          choose(item);
        }
        return;
      }
      default:
        return;
    }
  };

  const emptyMessage = isError
    ? "The ledgers could not be loaded."
    : debounced.trim()
      ? "No ledger that can hold this role matches that."
      : "No ledger can hold this role yet. Only a live, global ledger of the kind it needs is offered — create one in Ledger Master first.";

  return (
    <ModalPortal>
      <div className={styles.modalOverlay} role="presentation">
        <div className={styles.modalBackdrop} onClick={onClose} />
        <div
          className={styles.modalPanel}
          role="dialog"
          aria-modal="true"
          aria-label={`Select the ledger for ${row.label}`}
          onKeyDown={onKeyDown}
        >
          <header className={styles.modalHead}>
            <div className={styles.modalTitleBlock}>
              <h2 className={styles.modalTitle}>Ledger for “{row.label}”</h2>
              <p className={styles.modalSubtitle}>
                Needs {needsLabel(row)} — only ledgers that fit are offered.
              </p>
            </div>
            <button type="button" className={styles.modalClose} onClick={onClose} aria-label="Close">
              ×
            </button>
          </header>

          <div className={styles.modalSearch}>
            <input
              // `autoFocus`, not a timer: the portal mounts a commit late, and a
              // focus() scheduled on open can land before the input exists.
              autoFocus
              className={styles.modalSearchInput}
              value={search}
              placeholder="Ledger or group name"
              onChange={(event) => setSearch(event.target.value)}
              onFocus={(event) => {
                // The keystroke that opened the picker is already in the box;
                // the caret goes after it, so typing carries on rather than
                // replacing it.
                const end = event.currentTarget.value.length;
                event.currentTarget.setSelectionRange(end, end);
              }}
            />
          </div>

          <div ref={bodyRef} className={styles.modalBody}>
            <table className={styles.pickerTable}>
              <thead>
                <tr>
                  <th>Ledger</th>
                  <th>Short</th>
                  <th>Group</th>
                  <th>Type</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => {
                  const current = item.led_id === row.ledgerId;
                  return (
                    <tr
                      key={item.led_id}
                      className={[
                        index === activeIndex ? styles.pickerRowActive : "",
                        current ? styles.pickerRowCurrent : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      data-active={index === activeIndex ? "true" : undefined}
                      title={current ? "This role points here now" : undefined}
                      onMouseMove={(event) => onRowMouseMove(event, index)}
                      onClick={() => choose(item)}
                    >
                      <td>
                        {item.led_name}
                        {current ? <span className={styles.pickerCurrentTag}>current</span> : null}
                      </td>
                      <td>{item.led_short ?? ""}</td>
                      <td>{item.acc_group_name ?? ""}</td>
                      <td>{item.led_ledger_type ?? ""}</td>
                    </tr>
                  );
                })}
                {items.length === 0 && !isFetching ? (
                  <tr>
                    <td colSpan={4} className={styles.pickerEmpty}>
                      {emptyMessage}
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
                onClick={() => turnPage(Math.max(1, page - 1))}
              >
                Previous
              </button>
              <button
                type="button"
                className={styles.secondaryButton}
                disabled={page >= pageCount}
                onClick={() => turnPage(Math.min(pageCount, page + 1))}
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
