"use client";
/**
 * F10 — the parked carts, and the way back to one.
 *
 * Two filters run, and both are load-bearing:
 *
 *  - **on the wire**, the tenant scope. Sending it is also what keeps the
 *    request off the configured-grid path: the module answers from its own
 *    Prisma query only when a structured filter is present, and the stored grid
 *    SQL knows none of these, so a search-only request would list every
 *    company's holds. `thDocType` is deliberately NOT sent — carts parked before
 *    the server's enum grew `QUOTATION` carry `SALE_ORDER`, and filtering on
 *    either one alone would hide half of them. Neither is `thStatus`: the list
 *    shows both free and in-use carts (see below), and the filter takes one
 *    value.
 *  - **client-side**, `isQuotationHold` — the `th_ui_state` stamp, which is the
 *    real test of "this screen wrote it" and is blind to the document type. A
 *    row it did not write cannot be redrawn here, so it is left out rather than
 *    offered and then refused. Then `HOLD_LIVE_STATUSES`, which drops the
 *    converted, cancelled and expired rows the unfiltered query brings back.
 *
 * **In-use rows are listed, not hidden.** A cart another device has open shows
 * greyed with who holds it, because hiding it would leave an operator staring at
 * a cart that has simply vanished. Resume refuses it — the server would answer
 * 409 anyway — and offers **Take over** instead: nothing times a lock out, so a
 * till that died holding a cart would otherwise strand it for good.
 *
 * Discard is a soft delete, and it is offered because a hold nobody is coming
 * back for otherwise sits in this list forever — nothing expires it.
 */
import { useEffect, useMemo, useState } from "react";
import { FiCheckCircle, FiRefreshCw, FiTrash2, FiUnlock } from "react-icons/fi";
import { toast } from "react-toastify";
import { cx } from "@/components/design-system/cx";
import {
  useDeleteTransactionHoldMutation,
  useListTransactionHoldsQuery,
} from "@/store/api/quotationApi";
import { HOLD_LIVE_STATUSES } from "../quotation.constants";
import { holdAccYearOf, holdHolderLabel, isHoldInUse, isQuotationHold } from "../quotation.hold";
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
  /** Frees a cart another device holds. Resolves `false` when the server refused. */
  onTakeOver: (hold: TransactionHoldPayload) => Promise<boolean>;
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
  const { isOpen, companyId, branchId, accYear, onClose, onPick, onTakeOver } = props;
  const [search, setSearch] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [discarding, setDiscarding] = useState<string | null>(null);
  const [takingOver, setTakingOver] = useState<string | null>(null);
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
      page: 1,
      limit: FETCH_LIMIT,
    },
    // The scope is what keeps the query off the unfiltered configured grid, so
    // there is nothing safe to ask for until it has resolved.
    { skip: !isOpen || !companyId || !branchId },
  );
  const rows = useMemo(() => {
    const all = (data?.items ?? [])
      .filter(isQuotationHold)
      .filter((row) => (HOLD_LIVE_STATUSES as readonly string[]).includes(row.thStatus));
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
    // The server would refuse this with a 409 anyway; saying so here costs a
    // round trip less and points at the way through.
    if (isHoldInUse(row)) {
      toast.info(
        `Hold ${row.thHoldNo} is open on ${holdHolderLabel(row)}. ` +
          "Use Take over if that device is not coming back.",
      );
      return;
    }
    onPick(row.thId);
  };
  const takeOver = async (row: TransactionHoldPayload) => {
    setTakingOver(row.thId);
    try {
      if (await onTakeOver(row)) {
        // The row is free now, not open: the operator still has to resume it,
        // which is the same deliberate step as for any other held cart.
        await refetch();
      }
    } finally {
      setTakingOver(null);
    }
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
          ↑↓ move · Enter resume · Esc cancel · a cart in use is locked to another device until it
          releases it or you take it over
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
          // Only ever offered on a cart somebody else has: it interrupts that
          // device, so it is not a shortcut for the ordinary resume.
          disabled={!activeRow || !isHoldInUse(activeRow) || takingOver !== null}
          title={
            activeRow && isHoldInUse(activeRow)
              ? `Free this cart from ${holdHolderLabel(activeRow)} — use it when that device is not coming back`
              : "Only a cart open on another device can be taken over"
          }
          onClick={() => activeRow && void takeOver(activeRow)}
        >
          <FiUnlock aria-hidden="true" />
          Take over
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
              <th scope="col">Status</th>
              <th scope="col">Remarks</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const inUse = isHoldInUse(row);
              return (
                <tr
                  key={row.thId}
                  data-selected={index === activeIndex ? "true" : undefined}
                  // Greyed rather than removed: a cart that simply vanished from
                  // the list reads as lost, not as busy.
                  data-disabled={inUse ? "true" : undefined}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => choose(row)}
                >
                  <td>{heldAt(row.thHoldDate)}</td>
                  <td>{row.thHoldNo}</td>
                  <td>{row.thCustomerName ?? ""}</td>
                  <td className={styles.alignRight}>{row.thItemCount ?? 0}</td>
                  <td className={styles.alignRight}>{toNumber(row.thTotalQty).toFixed(3)}</td>
                  <td className={styles.alignRight}>{toNumber(row.thTotalAmount).toFixed(2)}</td>
                  <td>
                    {inUse ? (
                      <span className={styles.holdInUse}>
                        {takingOver === row.thId
                          ? "Freeing…"
                          : `In use — ${holdHolderLabel(row)}`}
                      </span>
                    ) : (
                      "Free"
                    )}
                  </td>
                  <td>{row.thRemarks ?? ""}</td>
                </tr>
              );
            })}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className={styles.emptyGrid}>
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
