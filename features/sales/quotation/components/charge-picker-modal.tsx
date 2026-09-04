"use client";
/**
 * The charge picker.
 *
 * Backed by `GET /charges/get?chgModule=S`, not by the configured popup grid 82:
 * grid 82 selects only `chg_id` and `chg_name`, and a charge line cannot be saved
 * without `cdLedgerCode`, which comes from the master row's `chgLedgerCode`. The
 * master is small and unpaginated by design, so it is fetched once and filtered
 * here.
 */
import { useEffect, useMemo, useState } from "react";
import {
  CHARGE_APPLY_ON_LABELS,
  CHARGE_METHOD_LABELS,
  CHARGE_TYPE_LABELS,
} from "../quotation.constants";
import type { ChargeApplyOn, ChargeMethod, ChargeType } from "@/domain/pricing";
import type { ChargeMasterRow } from "../quotation.types";
import { ModalShell } from "./modal-shell";
import styles from "../page.module.scss";
export type ChargePickerModalProps = {
  isOpen: boolean;
  charges: ChargeMasterRow[];
  /**
   * Charge ids already on the grid. One charge may appear on a document once —
   * a second row of the same charge is added straight into the totals twice —
   * so these are listed but not selectable.
   */
  usedChargeIds?: string[];
  onClose: () => void;
  onPick: (charge: ChargeMasterRow) => void;
};
function label<T extends string>(map: Record<T, string>, value: string): string {
  return (map as Record<string, string>)[value] ?? value;
}
export function ChargePickerModal(props: ChargePickerModalProps) {
  const { isOpen, charges, usedChargeIds = [], onClose, onPick } = props;
  const [search, setSearch] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  useEffect(() => {
    if (isOpen) {
      setSearch("");
      setActiveIndex(0);
    }
  }, [isOpen]);
  const used = useMemo(() => new Set(usedChargeIds), [usedChargeIds]);
  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) {
      return charges;
    }
    return charges.filter(
      (charge) =>
        charge.chgName.toLowerCase().includes(needle) ||
        (charge.chgCode ?? "").toLowerCase().includes(needle) ||
        (charge.chgLedgerName ?? "").toLowerCase().includes(needle),
    );
  }, [charges, search]);
  /**
   * The rows Enter may act on. An already-applied charge stays in the list —
   * greyed rather than hidden, the way the held-cart list does it, because a
   * charge that simply vanished reads as missing from the master rather than as
   * already on the document — but ↑↓ steps over it, so the cursor can never come
   * to rest somewhere Enter would do nothing.
   */
  const selectable = useMemo(
    () => rows.reduce<number[]>((keep, charge, index) => {
      if (!used.has(charge.chgId)) {
        keep.push(index);
      }
      return keep;
    }, []),
    [rows, used],
  );
  /**
   * Where the cursor actually is. Derived rather than corrected after the fact:
   * filtering the list, or applying a charge, can strand the stored index on a
   * row that is no longer selectable, and falling back to the first selectable
   * row here keeps Enter live without a second render to fix it up.
   */
  const cursor =
    rows[activeIndex] && !used.has(rows[activeIndex].chgId) ? activeIndex : selectable[0] ?? -1;
  const step = (delta: 1 | -1): void => {
    const position = selectable.indexOf(cursor);
    const next = position < 0 ? selectable[0] : selectable[position + delta];
    if (next !== undefined) {
      setActiveIndex(next);
    }
  };
  /** The one gate every pick goes through — click and Enter alike. */
  const pick = (charge: ChargeMasterRow): void => {
    if (used.has(charge.chgId)) {
      return;
    }
    onPick(charge);
  };
  return (
    <ModalShell
      title="Select charge"
      isOpen={isOpen}
      fixedHeight
      onClose={onClose}
      footer={
        <span className={styles.modalNote}>
          {rows.length} of {charges.length} sales charges
          {used.size > 0 ? ` · ${used.size} already on this document` : ""}
        </span>
      }
    >
      <input
        className={styles.input}
        value={search}
        placeholder="Filter by charge, code or ledger…"
        autoFocus
        autoComplete="off"
        onChange={(event) => {
          setSearch(event.target.value);
          setActiveIndex(0);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            step(1);
          }
          if (event.key === "ArrowUp") {
            event.preventDefault();
            step(-1);
          }
          if (event.key === "Enter" && rows[cursor]) {
            event.preventDefault();
            pick(rows[cursor]);
          }
        }}
      />
      <div className={styles.listViewport}>
        <table className={styles.listTable}>
          <thead>
            <tr>
              <th scope="col">Charge</th>
              <th scope="col">Ledger</th>
              <th scope="col">Method</th>
              <th scope="col">Type</th>
              <th scope="col">Apply on</th>
              <th scope="col">Rate</th>
              <th scope="col">Tax</th>
              <th scope="col" />
            </tr>
          </thead>
          <tbody>
            {rows.map((charge, index) => {
              const applied = used.has(charge.chgId);
              return (
                <tr
                  key={charge.chgId}
                  data-selected={index === cursor ? "true" : undefined}
                  data-disabled={applied ? "true" : undefined}
                  aria-disabled={applied || undefined}
                  title={applied ? `${charge.chgName} is already on this document.` : undefined}
                  // The cursor never parks on an applied row, so hovering one must
                  // not move it there either.
                  onMouseEnter={() => {
                    if (!applied) {
                      setActiveIndex(index);
                    }
                  }}
                  onClick={() => pick(charge)}
                >
                  <td>{charge.chgName}</td>
                  <td>{charge.chgLedgerName ?? "—"}</td>
                  <td>{label<ChargeMethod>(CHARGE_METHOD_LABELS, charge.chgMethod)}</td>
                  <td>{label<ChargeType>(CHARGE_TYPE_LABELS, charge.chgType)}</td>
                  <td>{label<ChargeApplyOn>(CHARGE_APPLY_ON_LABELS, charge.chgApplyOn)}</td>
                  <td className={styles.alignRight}>{charge.chgDefaultRate ?? 0}</td>
                  <td>
                    {charge.chgBeforeTax
                      ? "before tax"
                      : charge.chgTaxApl
                        ? `own GST ${charge.ledGstRate ?? 0}%`
                        : "after tax"}
                  </td>
                  <td className={styles.modalNote}>{applied ? "already applied" : ""}</td>
                </tr>
              );
            })}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className={styles.emptyGrid}>
                  No sales charge matches that.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </ModalShell>
  );
}