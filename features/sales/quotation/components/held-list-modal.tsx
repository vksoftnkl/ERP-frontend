"use client";
/**
 * F10 — the parked carts, and the way back to one.
 *
 * Two filters run, and both are load-bearing:
 *
 *  - **on the wire**, the tenant scope plus `thDocType` and `thStatus=HELD`.
 *    Sending them is also what keeps the request off the configured-grid path:
 *    the module answers from its own Prisma query only when a structured filter
 *    is present, and the stored grid SQL knows none of these, so a search-only
 *    request would list every company's holds.
 *  - **client-side**, `isQuotationHold`. `transaction_hold` has no document type
 *    for a quotation (see `QUOTATION_HOLD_DOC_TYPE`), so this screen's carts
 *    share `SALE_ORDER` with anything else that parks one. A row whose
 *    `th_ui_state` this screen did not write cannot be redrawn here, so it is
 *    left out rather than offered and then refused.
 *
 * Discard is a soft delete, and it is offered because a hold nobody is coming
 * back for otherwise sits in this list forever — nothing expires it.
 */
import { useEffect, useMemo, useState } from "react";
import { FiCheckCircle, FiRefreshCw, FiTrash2 } from "react-icons/fi";
import { toast } from "react-toastify";
import { cx } from "@/components/design-system/cx";
import {
  useDeleteTransactionHoldMutation,
  useListTransactionHoldsQuery,
} from "@/store/api/quotationApi";
import { QUOTATION_HOLD_DOC_TYPE } from "../quotation.constants";
import { holdAccYearOf, isQuotationHold } from "../quotation.hold";
import type { TransactionHoldPayload } from "../quotation.types";
import { toNumber } from "../quotation.utils";
import { ModalShell } from "./modal-shell";
import styles from "../page.module.scss";
export type HeldListModalProps = {
  isOpen: boolean;
  /** Only holds parked in this tenant are offered. */
  companyId: string;
  branchId: string;
  accYear: string;
  onClose: () => void;
  onPick: (thId: string) => void;
};
/** The server's own cap; asking for more is a 400. */
const FETCH_LIMIT = 100;
/** `th_hold_date` is a full ISO timestamp — a parked cart is minutes old, not days. */
function heldAt(value: string | null): string {
  if (!value) {
    return "";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }
  const date = `${`${parsed.getDate()}`.padStart(2, "0")}-${`${parsed.getMonth() + 1}`.padStart(2, "0")}-${parsed.getFullYear()}`;
  const time = `${`${parsed.getHours()}`.padStart(2, "0")}:${`${parsed.getMinutes()}`.padStart(2, "0")}`;
  return `${date} ${time}`;
}
export function HeldListModal(props: HeldListModalProps) {
  const { isOpen, companyId, branchId, accYear, onClose, onPick } = props;
  const [search, setSearch] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [discarding, setDiscarding] = useState<string | null>(null);
  const [deleteHold] = useDeleteTransactionHoldMutation();
  useEffect(() => {
    if (isOpen) {
      setSearch("");
      setActiveIndex(0);
    }
  }, [isOpen]);
  const holdAccYear = holdAccYearOf(accYear);
  const { data, isFetching, refetch } = useListTransactionHoldsQuery(
    {
      thCompanyId: companyId,
      thBranchId: branchId,
      ...(holdAccYear === null ? {} : { thAccYear: holdAccYear }),
      thDocType: QUOTATION_HOLD_DOC_TYPE,
      thStatus: "HELD",
      page: 1,
      limit: FETCH_LIMIT,
    },
    // The scope is what keeps the query off the unfiltered configured grid, so
    // there is nothing safe to ask for until it has resolved.
    { skip: !isOpen || !companyId || !branchId },
  );
  const rows = useMemo(() => {
    const all = (data?.items ?? []).filter(isQuotationHold);
    const needle = search.trim().toLowerCase();
    if (!needle) {
      return all;
    }
    return all.filter((row) =>
      [row.thHoldNo, row.thCustomerName, row.thRemarks, String(toNumber(row.thTotalAmount))]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(needle)),
    );
  }, [data, search]);
  useEffect(() => {
    setActiveIndex(0);
  }, [rows.length]);
  const choose = (row: TransactionHoldPayload) => {
    onPick(row.thId);
  };
  const discard = async (row: TransactionHoldPayload) => {
    setDiscarding(row.thId);
    try {
      await deleteHold(row.thId).unwrap();
      toast.success(`Hold ${row.thHoldNo} discarded.`);
    } catch {
      toast.error(`Hold ${row.thHoldNo} could not be discarded.`);
    } finally {
      setDiscarding(null);
    }
  };
  const activeRow = rows[activeIndex];
  return (
    <ModalShell
      title="Held quotations"
      isOpen={isOpen}
      wide
      onClose={onClose}
      footer={
        <span className={styles.modalNote}>
          ↑↓ move · Enter resume · Esc cancel · a resumed cart leaves this list until it is held
          again
        </span>
      }
    >
      <div className={styles.listToolbar}>
        <button
          type="button"
          className={cx(styles.toolButton, styles.toolButtonActive)}
          disabled={!activeRow}
          onClick={() => activeRow && choose(activeRow)}
        >
          <FiCheckCircle aria-hidden="true" />
          Resume
        </button>
        <button
          type="button"
          className={styles.toolButton}
          disabled={!activeRow || discarding !== null}
          onClick={() => activeRow && void discard(activeRow)}
        >
          <FiTrash2 aria-hidden="true" />
          Discard
        </button>
        <button type="button" className={styles.toolButton} onClick={() => void refetch()}>
          <FiRefreshCw aria-hidden="true" />
          Refresh
        </button>
      </div>
      <div className={styles.listFilters}>
        <label className={styles.filterField}>
          <span>Search:</span>
          <input
            className={styles.input}
            value={search}
            placeholder="hold no, customer, remarks…"
            autoFocus
            autoComplete="off"
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActiveIndex((index) => Math.min(index + 1, Math.max(rows.length - 1, 0)));
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                setActiveIndex((index) => Math.max(index - 1, 0));
              }
              if (event.key === "Enter" && rows[activeIndex]) {
                event.preventDefault();
                choose(rows[activeIndex]);
              }
            }}
          />
        </label>
      </div>
      <div className={styles.listViewport}>
        <table className={styles.listTable}>
          <thead>
            <tr>
              <th scope="col">Held at</th>
              <th scope="col">Hold No</th>
              <th scope="col">Customer</th>
              <th scope="col">Items</th>
              <th scope="col">Qty</th>
              <th scope="col">Amount</th>
              <th scope="col">Remarks</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr
                key={row.thId}
                data-selected={index === activeIndex ? "true" : undefined}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => choose(row)}
              >
                <td>{heldAt(row.thHoldDate)}</td>
                <td>{row.thHoldNo}</td>
                <td>{row.thCustomerName ?? ""}</td>
                <td className={styles.alignRight}>{row.thItemCount ?? 0}</td>
                <td className={styles.alignRight}>{toNumber(row.thTotalQty).toFixed(3)}</td>
                <td className={styles.alignRight}>{toNumber(row.thTotalAmount).toFixed(2)}</td>
                <td>{row.thRemarks ?? ""}</td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className={styles.emptyGrid}>
                  {isFetching ? "Loading…" : "No quotation is on hold."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </ModalShell>
  );
}
