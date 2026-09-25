"use client";

/**
 * Ctrl+F6's picker (§22 step 2): grid 115, "Recent bills — re-tender". It
 * lists THIS device's bills from today, newest first; the hint says "Type a
 * bill number for anything older", and a typed number widens the window to
 * every device and every date. The pick label is "Re-tender".
 */
import { useEffect, useMemo, useState } from "react";
import { FiRefreshCw, FiRepeat } from "react-icons/fi";
import { cx } from "@/components/design-system/cx";
import { ModalShell } from "@/features/sales/quotation/components/modal-shell";
import { useListKeyboardNav } from "@/features/sales/quotation/components/use-list-keyboard-nav";
import { todayIso, toNumber } from "@/features/sales/quotation/quotation.utils";
import quotationStyles from "@/features/sales/quotation/page.module.scss";
import { useListRetenderBillsQuery, type RetenderPickRow } from "@/features/sales/testbill/api/bills";
import type { BillKey } from "@/features/sales/testbill/types";

export type RetenderPickerProps = {
  isOpen: boolean;
  companyId: string;
  branchId: string;
  accYear: string;
  /** The session's registered device; '' lists every device. */
  deviceId: string;
  onClose: () => void;
  onPick: (key: BillKey, refno: string | null) => void;
};

function keyOf(row: RetenderPickRow): BillKey {
  return { sbId: row.sb_id, sbCompanyId: row.sb_company_id, sbBranchId: row.sb_branch_id, sbAccYear: row.sb_acc_year };
}

function timeOf(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function RetenderPicker({ isOpen, companyId, branchId, accYear, deviceId, onClose, onPick }: RetenderPickerProps) {
  const [billNo, setBillNo] = useState("");
  const [debounced, setDebounced] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (isOpen) {
      setBillNo("");
      setDebounced("");
      setActiveIndex(0);
    }
  }, [isOpen]);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(billNo.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [billNo]);

  const widened = debounced.length > 0;
  const { data, isFetching, refetch } = useListRetenderBillsQuery(
    {
      companyId,
      branchId,
      accYear,
      limit: 100,
      deviceId: widened ? "" : deviceId,
      fromDate: widened ? "" : todayIso(),
      toDate: widened ? "" : todayIso(),
    },
    { skip: !isOpen || !companyId || !branchId || !accYear },
  );

  const rows = useMemo(() => {
    const all = (data?.items ?? []).filter((row) => (row.sb_status ?? "").toUpperCase() === "POSTED");
    if (!widened) {
      return all;
    }
    const needle = debounced.toLowerCase();
    return all.filter((row) => (row.sb_bill_refno ?? "").toLowerCase().includes(needle));
  }, [data, debounced, widened]);

  useEffect(() => {
    setActiveIndex(0);
  }, [rows.length]);

  const activeRow = rows[activeIndex];
  const { viewportRef } = useListKeyboardNav({
    isOpen,
    rowCount: rows.length,
    activeIndex,
    setActiveIndex,
    onEnter: () => {
      if (activeRow) onPick(keyOf(activeRow), activeRow.sb_bill_refno);
    },
  });

  return (
    <ModalShell
      title="Recent bills — re-tender"
      isOpen={isOpen}
      wide
      fixedHeight
      onClose={onClose}
      footer={
        <span className={quotationStyles.modalNote}>
          ↑↓ move · Enter or double-click re-tenders · Esc cancel · this device&apos;s bills from today — type a bill number for anything older
        </span>
      }
    >
      <div className={quotationStyles.listToolbar}>
        <button
          type="button"
          className={cx(quotationStyles.toolButton, quotationStyles.toolButtonActive)}
          disabled={!activeRow}
          onClick={() => activeRow && onPick(keyOf(activeRow), activeRow.sb_bill_refno)}
        >
          <FiRepeat aria-hidden="true" />
          Re-tender
        </button>
        <button type="button" className={quotationStyles.toolButton} onClick={() => void refetch()}>
          <FiRefreshCw aria-hidden="true" />
          Refresh
        </button>
      </div>
      <div className={quotationStyles.listFilters}>
        <label className={quotationStyles.filterField}>
          <span>Bill number:</span>
          <input className={quotationStyles.input} value={billNo} autoFocus autoComplete="off" placeholder="any device, any date" onChange={(event) => setBillNo(event.target.value)} />
        </label>
      </div>
      <div className={quotationStyles.listViewport} ref={viewportRef}>
        <table className={quotationStyles.listTable}>
          <thead>
            <tr>
              <th scope="col">Time</th>
              <th scope="col">Bill No</th>
              <th scope="col">Customer</th>
              <th scope="col">Total</th>
              <th scope="col">Mode</th>
              <th scope="col">Tenders</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr
                key={row.sb_id}
                data-selected={index === activeIndex ? "true" : undefined}
                onClick={() => setActiveIndex(index)}
                onDoubleClick={() => onPick(keyOf(row), row.sb_bill_refno)}
              >
                <td>{timeOf(row.sb_bill_datetime)}</td>
                <td>{row.sb_bill_refno ?? "—"}</td>
                <td>{row.sb_cust_name ?? ""}</td>
                <td className={quotationStyles.alignRight}>{toNumber(row.sb_bill_amt).toFixed(2)}</td>
                <td>{row.sb_pay_mode ?? ""}</td>
                <td>{row.tenders ?? ""}</td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className={quotationStyles.emptyGrid}>
                  {isFetching ? "Loading…" : widened ? "No posted bill matches that number." : "No bills posted on this device today."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </ModalShell>
  );
}
