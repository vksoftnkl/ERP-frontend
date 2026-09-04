"use client";
/**
 * F10 — the parked carts, and the way back to one.
 *
 * Two filters run, and both are load-bearing:
 *
 *  - **on the wire**, the tenant scope, the document type and `txhKind=HOLD`.
 *    Sending them is also what keeps the request off the configured-grid path:
 *    the module answers from its own Prisma query only when a structured filter
 *    is present, and the stored grid SQL knows none of these, so a search-only
 *    request would list every company's holds. The kind matters as much as the
 *    scope — `txn_hold` is shared with the till, and AUTOSAVE snapshots and
 *    TEMPLATEs live in the same table. `txhStatus` is deliberately NOT sent: the
 *    list shows both free and in-use carts (see below), and the filter takes one
 *    value.
 *  - **client-side**, `isQuotationHold` — the `txh_payload` stamp, which is the
 *    real test of "this screen wrote it". A row it did not write cannot be
 *    redrawn here, so it is left out rather than offered and then refused. Then
 *    `HOLD_LIVE_STATUSES`, which drops the converted, cancelled, expired and
 *    abandoned rows the unfiltered query brings back.
 *
 * **In-use rows are listed, not hidden.** A cart another device has open shows
 * greyed with who holds it, because hiding it would leave an operator staring at
 * a cart that has simply vanished. Resume refuses it — the server would answer
 * 409 anyway — and offers **Take over** instead. A lease does lapse on its own,
 * so a till that died mid-edit strands its cart only until then; take-over is
 * for the floor that needs it back sooner.
 *
 * Discard is a soft delete, and it is offered because a hold nobody is coming
 * back for otherwise sits in this list forever until its own expiry, if it was
 * given one.
 *
 * Resuming is a SINGLE gesture short of opening: a click (or ↑↓) moves the
 * highlight, Enter or a double-click resumes. Resuming replaces whatever is on
 * the form and takes the cart's lease, so it is not something a stray click on a
 * list should do. `useListKeyboardNav` is what keeps ↑↓ and Enter working once
 * the pointer has taken focus off the search box.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { FiCheckCircle, FiRefreshCw, FiTrash2, FiUnlock } from "react-icons/fi";
import { toast } from "react-toastify";
import { cx } from "@/components/design-system/cx";
import {
  useDeleteTxnHoldMutation,
  useListTxnHoldsQuery,
} from "@/store/api/quotationApi";
import {
  HOLD_LIVE_STATUSES,
  QUOTATION_HOLD_DOC_TYPE,
  QUOTATION_HOLD_KIND,
} from "../quotation.constants";
import { holdAccYearOf, holdHolderLabel, isHoldInUse, isQuotationHold } from "../quotation.hold";
import type { TxnHoldPayload } from "../quotation.types";
import { toNumber } from "../quotation.utils";
import { ModalShell } from "./modal-shell";
import { useListKeyboardNav } from "./use-list-keyboard-nav";
import styles from "../page.module.scss";
export type HeldListModalProps = {
  isOpen: boolean;
  /** Only holds parked in this tenant are offered. */
  companyId: string;
  branchId: string;
  accYear: string;
  onClose: () => void;
  onPick: (txhId: string) => void;
  /** Frees a cart another device holds. Resolves `false` when the server refused. */
  onTakeOver: (hold: TxnHoldPayload) => Promise<boolean>;
};
/** The server's own cap; asking for more is a 400. */
const FETCH_LIMIT = 100;
/** `txh_hold_on` is a full ISO timestamp — a parked cart is minutes old, not days. */
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
  const [deleteHold] = useDeleteTxnHoldMutation();
  useEffect(() => {
    if (isOpen) {
      setSearch("");
      setActiveIndex(0);
    }
  }, [isOpen]);
  const holdAccYear = holdAccYearOf(accYear);
  const { data, isFetching, refetch } = useListTxnHoldsQuery(
    {
      txhCompanyId: companyId,
      txhBranchId: branchId,
      // Worth sending on every query beyond narrowing the list: it is the
      // partition key, so it prunes the scan to one year.
      ...(holdAccYear === null ? {} : { txhAccYear: holdAccYear }),
      txhKind: QUOTATION_HOLD_KIND,
      txhDocType: QUOTATION_HOLD_DOC_TYPE,
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
      .filter((row) => (HOLD_LIVE_STATUSES as readonly string[]).includes(row.txhStatus));
    const needle = search.trim().toLowerCase();
    if (!needle) {
      return all;
    }
    return all.filter((row) =>
      [row.txhHoldNo, row.txhPartyName, row.txhRemarks, String(toNumber(row.txhNetAmount))]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(needle)),
    );
  }, [data, search]);
  useEffect(() => {
    setActiveIndex(0);
  }, [rows.length]);
  const choose = useCallback((row: TxnHoldPayload) => {
    // The server would refuse this with a 409 anyway; saying so here costs a
    // round trip less and points at the way through. A LAPSED lease is not in
    // use — the server hands that cart to the next device that asks — so this
    // does not stand in the way of one.
    if (isHoldInUse(row)) {
      toast.info(
        `Hold ${row.txhHoldNo} is open on ${holdHolderLabel(row)}. ` +
          "Use Take over if that device is not coming back.",
      );
      return;
    }
    onPick(row.txhId);
  }, [onPick]);
  const takeOver = async (row: TxnHoldPayload) => {
    setTakingOver(row.txhId);
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
  const discard = async (row: TxnHoldPayload) => {
    setDiscarding(row.txhId);
    try {
      await deleteHold({ txhId: row.txhId, txhAccYear: row.txhAccYear }).unwrap();
      toast.success(`Hold ${row.txhHoldNo} discarded.`);
    } catch {
      toast.error(`Hold ${row.txhHoldNo} could not be discarded.`);
    } finally {
      setDiscarding(null);
    }
  };
  const activeRow = rows[activeIndex];
  // ↑↓ / Enter for as long as the dialog is open, wherever focus has ended up.
  const { viewportRef } = useListKeyboardNav({
    isOpen,
    rowCount: rows.length,
    activeIndex,
    setActiveIndex,
    onEnter: () => {
      if (activeRow) {
        choose(activeRow);
      }
    },
  });
  return (
    <ModalShell
      title="Held quotations"
      isOpen={isOpen}
      wide
      fixedHeight
      onClose={onClose}
      footer={
        <span className={styles.modalNote}>
          ↑↓ move · click highlights · Enter or double-click resumes · Esc cancel · a cart in use is
          leased to another device until it releases it, the lease lapses, or you take it over
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
          />
        </label>
      </div>
      <div className={styles.listViewport} ref={viewportRef}>
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
                  key={row.txhId}
                  data-selected={index === activeIndex ? "true" : undefined}
                  // Greyed rather than removed: a cart that simply vanished from
                  // the list reads as lost, not as busy.
                  data-disabled={inUse ? "true" : undefined}
                  // Click, arrow keys and the search filter move the
                  // highlight — hovering does NOT. It is what Enter and Resume
                  // act on, so a row the pointer crossed on its way to a button
                  // must not quietly become the row that opens.
                  onClick={() => setActiveIndex(index)}
                  onDoubleClick={() => choose(row)}
                >
                  <td>{heldAt(row.txhHoldOn)}</td>
                  <td>{row.txhHoldNo}</td>
                  <td>{row.txhPartyName ?? ""}</td>
                  <td className={styles.alignRight}>{row.txhItemCount ?? 0}</td>
                  <td className={styles.alignRight}>{toNumber(row.txhTotalQty).toFixed(3)}</td>
                  <td className={styles.alignRight}>{toNumber(row.txhNetAmount).toFixed(2)}</td>
                  <td>
                    {inUse ? (
                      <span className={styles.holdInUse}>
                        {takingOver === row.txhId
                          ? "Freeing…"
                          : `In use — ${holdHolderLabel(row)}`}
                      </span>
                    ) : (
                      "Free"
                    )}
                  </td>
                  <td>{row.txhRemarks ?? ""}</td>
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
