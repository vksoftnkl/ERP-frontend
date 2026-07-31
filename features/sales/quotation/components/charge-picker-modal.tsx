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
  /** Charge ids already on the grid, so a duplicate can be flagged. */
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

  return (
    <ModalShell
      title="Select charge"
      isOpen={isOpen}
      onClose={onClose}
      footer={<span className={styles.modalNote}>{rows.length} of {charges.length} sales charges</span>}
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
            setActiveIndex((index) => Math.min(index + 1, Math.max(rows.length - 1, 0)));
          }
          if (event.key === "ArrowUp") {
            event.preventDefault();
            setActiveIndex((index) => Math.max(index - 1, 0));
          }
          if (event.key === "Enter" && rows[activeIndex]) {
            event.preventDefault();
            onPick(rows[activeIndex]);
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
            {rows.map((charge, index) => (
              <tr
                key={charge.chgId}
                data-selected={index === activeIndex ? "true" : undefined}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => onPick(charge)}
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
                <td className={styles.modalNote}>
                  {used.has(charge.chgId) ? "already applied" : ""}
                </td>
              </tr>
            ))}
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
