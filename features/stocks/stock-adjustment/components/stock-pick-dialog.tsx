"use client";

/**
 * "Pick from stock" — the Qt `StockPickDialog`, over
 * `GET /stock/adjustment/pick-stock`. One row per holding (lot × bucket in this
 * godown, available > 0) with the lot's identity, its supplier and the branch
 * average; every bucket is listed, a Damaged row sitting among the Saleable
 * ones, chip-coloured. Picking a row gives the line its lot, so the engine
 * takes exactly that holding instead of choosing one by the item's issue
 * strategy.
 *
 * Enter in the search box drops to the list; Enter on a row picks it. No
 * default button.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { skipToken } from "@reduxjs/toolkit/query";
import { cx } from "@/components/design-system/cx";
import { formatCurrency } from "@/domain/pricing";
import { ModalShell } from "@/features/sales/quotation/components/modal-shell";
import quotationStyles from "@/features/sales/quotation/page.module.scss";
import { useStockAdjustmentPickStockQuery } from "../stock-adjustment.api";
import { bucketLabel } from "../stock-adjustment.constants";
import { dateFromWire, pickQtyText } from "../stock-adjustment.format";
import { pickDisplayRows, pickNote, type PickDisplayRow } from "../stock-adjustment.pick";
import type { PickStockRow } from "../stock-adjustment.types";
import { apiErrorText } from "../stock-adjustment.validate";
import styles from "../page.module.scss";

export type StockPickDialogProps = {
  isOpen: boolean;
  companyId: string;
  branchId: string;
  godownId: string;
  godownName: string;
  /** Narrow to one item (the line's). Null = every item in the godown. */
  item: { itemId: string; itemName: string } | null;
  /** Group the rows under a supplier heading — Move stock. */
  groupBySupplier: boolean;
  /** Expiry write-off: offer only lots expired by this day (ISO). */
  expiredBy: string | null;
  onClose: () => void;
  onPick: (row: PickStockRow) => void;
};

export function StockPickDialog(props: StockPickDialogProps) {
  const { isOpen, companyId, branchId, godownId, godownName, item, groupBySupplier, expiredBy, onClose, onPick } =
    props;
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [active, setActive] = useState(-1);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      setSearch("");
      setDebounced("");
      setShowAll(false);
      setActive(-1);
      window.requestAnimationFrame(() => searchRef.current?.focus());
    }
  }, [isOpen]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(search), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  const { currentData, isFetching, error } = useStockAdjustmentPickStockQuery(
    isOpen && godownId
      ? {
          companyId,
          branchId,
          godownId,
          ...(item?.itemId ? { itemId: item.itemId } : {}),
          ...(debounced.trim() ? { search: debounced.trim() } : {}),
          limit: 500,
        }
      : skipToken,
    { refetchOnMountOrArgChange: true },
  );
  const rows = useMemo(() => currentData ?? [], [currentData]);
  const { display, hidden } = useMemo(
    () => pickDisplayRows(rows, { group: groupBySupplier, expiredBy, showAll }),
    [expiredBy, groupBySupplier, rows, showAll],
  );
  const pickable = useMemo(
    () => display.map((entry, index) => (entry.type === "row" ? index : -1)).filter((index) => index >= 0),
    [display],
  );

  // Land on the first pickable row, so Enter from the search box picks it.
  useEffect(() => {
    setActive(pickable.length > 0 ? pickable[0] : -1);
  }, [pickable]);

  const note = pickNote(rows, { itemScoped: Boolean(item?.itemId), hidden, expiredBy });

  const accept = (index: number) => {
    const entry = display[index];
    if (entry?.type === "row") {
      onPick(entry.row);
    }
  };

  const step = (delta: 1 | -1) => {
    if (pickable.length === 0) {
      return;
    }
    const at = pickable.indexOf(active);
    const next = at < 0 ? 0 : Math.min(pickable.length - 1, Math.max(0, at + delta));
    setActive(pickable[next]);
    listRef.current
      ?.querySelector<HTMLElement>(`[data-pick-index="${pickable[next]}"]`)
      ?.scrollIntoView({ block: "nearest" });
  };

  const renderEntry = (entry: PickDisplayRow, index: number) => {
    if (entry.type === "group") {
      return (
        <tr key={entry.key} className={styles.groupRow}>
          <td>{entry.supplier}</td>
          <td colSpan={7}>{entry.summary}</td>
        </tr>
      );
    }
    const row = entry.row;
    const mrp = Number(row.mrp) || 0;
    return (
      <tr
        key={entry.key}
        data-pick-index={index}
        data-selected={index === active ? "true" : undefined}
        className={entry.grey ? styles.greyRow : undefined}
        onMouseEnter={() => setActive(index)}
        onClick={() => accept(index)}
      >
        {groupBySupplier ? <td /> : null}
        <td>{row.itemName}</td>
        <td>{row.batchNo ?? ""}</td>
        <td className={quotationStyles.alignCenter}>{dateFromWire(row.expiryDate)}</td>
        <td className={quotationStyles.alignRight}>{mrp > 0 ? formatCurrency(mrp, 2, true) : ""}</td>
        <td className={cx(quotationStyles.alignCenter, row.bucket === "DAMAGED" && styles.damagedCell)}>
          {bucketLabel(row.bucket)}
        </td>
        <td className={quotationStyles.alignCenter}>{pickQtyText(Number(row.availableQty) || 0)}</td>
        <td className={quotationStyles.alignRight}>{formatCurrency(Number(row.avgCostRate) || 0, 2, true)}</td>
      </tr>
    );
  };

  return (
    <ModalShell
      title={`Pick from stock — ${godownName}`}
      isOpen={isOpen}
      wide
      fixedHeight
      onClose={onClose}
      footer={
        <>
          <span className={quotationStyles.modalNote}>
            {isFetching ? "Loading…" : `${rows.length} holding${rows.length === 1 ? "" : "s"}`}
          </span>
          <span className={quotationStyles.gridHeadActions}>
            <button
              type="button"
              className={cx(quotationStyles.button, quotationStyles.buttonPrimary)}
              disabled={active < 0}
              onClick={() => accept(active)}
            >
              Pick
            </button>
            <button type="button" className={quotationStyles.button} onClick={onClose}>
              Cancel
            </button>
          </span>
        </>
      }
    >
      <p className={styles.pickSub}>holdings with stock available · Enter picks the row</p>
      <div className={styles.pickFilters}>
        <label className={quotationStyles.label} htmlFor="stock-pick-search">
          Search
        </label>
        <input
          id="stock-pick-search"
          ref={searchRef}
          className={quotationStyles.input}
          value={search}
          placeholder={item?.itemName ? `batch no of ${item.itemName}` : "item name, item code or batch no"}
          autoComplete="off"
          onChange={(event) => setSearch(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              // Enter in the search box lands on the list, where the next Enter picks.
              setDebounced(search);
              listRef.current?.focus();
              if (active < 0 && pickable.length > 0) {
                setActive(pickable[0]);
              }
            }
            if (event.key === "ArrowDown") {
              event.preventDefault();
              listRef.current?.focus();
            }
          }}
        />
        {expiredBy ? (
          <label className={quotationStyles.check}>
            <input type="checkbox" checked={showAll} onChange={(event) => setShowAll(event.target.checked)} />
            Show lots not yet expired
          </label>
        ) : null}
      </div>
      <div
        ref={listRef}
        className={quotationStyles.listViewport}
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            step(1);
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            step(-1);
          } else if (event.key === "Enter") {
            event.preventDefault();
            accept(active);
          }
        }}
      >
        <table className={quotationStyles.listTable}>
          <thead>
            <tr>
              {groupBySupplier ? <th scope="col">Supplier</th> : null}
              <th scope="col">Item</th>
              <th scope="col">Batch</th>
              <th scope="col">Expiry</th>
              <th scope="col">MRP</th>
              <th scope="col">Bucket</th>
              <th scope="col">Avail</th>
              <th scope="col">Avg cost</th>
            </tr>
          </thead>
          <tbody>
            {display.map(renderEntry)}
            {display.length === 0 ? (
              <tr>
                <td colSpan={groupBySupplier ? 8 : 7} className={quotationStyles.emptyGrid}>
                  {isFetching ? "Loading…" : error ? apiErrorText(error) : note.text}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <p className={styles.pickNote}>{note.text}</p>
      <p className={cx(styles.pickNote, styles.pickNoteBlock)}>{note.block}</p>
    </ModalShell>
  );
}
