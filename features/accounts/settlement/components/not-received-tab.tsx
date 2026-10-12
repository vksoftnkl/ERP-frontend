"use client";

/**
 * Not received — Qt tabNotReceived: our tender rows still PENDING / PARTIAL
 * past the expected date + grace (grid 140), and the write-off panel —
 * RECOVER from a named ledger / keep in SUSPENSE / LOSS — a TVar, the row
 * FAILED. Needs OVERRIDE (stands in for NONCASH_WRITE_OFF).
 */
import { useMemo } from "react";
import { cx } from "@/components/design-system/cx";
import { NexDropdownSingle } from "@/components/design-system/dropdown";
import { useDropdownId } from "@/lib/configured-dropdowns";
import {
  NOT_RECEIVED_HINT,
  WRITE_OFF_NOTE,
  WRITE_OFF_OVERRIDE_TITLE,
  WRITE_OFF_TREATMENTS,
  notReceivedFacts,
  notReceivedHead,
  type ReasonOption,
} from "../domain/exceptions";
import type { GridColumn } from "../domain/grid-columns";
import type { GridList } from "../hooks/use-grid-list";
import type { NotReceivedState } from "../hooks/use-exceptions";
import { GridTable } from "./grid-table";
import styles from "../page.module.scss";

export function NotReceivedTab({
  state,
  list,
  columns,
  reasons,
  companyId,
  hidden,
}: {
  state: NotReceivedState;
  list: GridList;
  columns: readonly GridColumn[];
  reasons: readonly ReasonOption[];
  companyId: string;
  hidden: boolean;
}) {
  // A recovery ledger: a staff advance, a party (Qt kPartyDropdownId — PAYMENT PAYEES).
  const recoverDropdownId = useDropdownId("paymentPayee");
  const ledgerParams = useMemo(() => ({ icompany_id: companyId }), [companyId]);
  const row = state.row;
  const disabled = row === null || state.busy;

  return (
    <div className={styles.tabBody} hidden={hidden} role="tabpanel" aria-label="Not received">
      <p className={styles.hint}>{NOT_RECEIVED_HINT}</p>
      <GridTable
        className={styles.gridGrow}
        columns={columns}
        rows={list.rows}
        loading={list.loading}
        error={list.error}
        current={state.current}
        onCurrent={state.setCurrent}
        emptyText="Nothing overdue: every card / UPI row past its date has its money."
        ariaLabel="Not received"
      />
      <section className={cx(styles.panel, row === null && styles.panelDisabled)} aria-label="Write off">
        <div className={styles.decide}>
          <div className={styles.formGrid}>
            <span className={styles.decideHead} style={{ gridColumn: "1 / -1" }}>
              {notReceivedHead(row)}
            </span>
            {row ? (
              <span className={styles.muted} style={{ gridColumn: "1 / -1" }}>
                {notReceivedFacts(row)}
              </span>
            ) : null}
            <span className={styles.formLabel}>Decide</span>
            <div className={styles.radios} role="radiogroup" aria-label="Decide">
              {WRITE_OFF_TREATMENTS.map((option) => (
                <label key={option.value} className={styles.radio}>
                  <input
                    type="radio"
                    name="settlement-write-off"
                    checked={state.treatment === option.value}
                    disabled={disabled}
                    onChange={() => state.setTreatment(option.value)}
                  />
                  {option.label}
                </label>
              ))}
            </div>
            <label className={styles.formLabel} htmlFor="settlement-wo-reason">
              Reason *
            </label>
            <select
              id="settlement-wo-reason"
              className={styles.select}
              value={state.reasonId}
              disabled={disabled}
              onChange={(event) => state.setReasonId(event.target.value)}
            >
              <option value="">Pick a reason</option>
              {reasons.map((reason) => (
                <option key={reason.id} value={reason.id}>
                  {reason.label}
                </option>
              ))}
            </select>
            <span className={styles.formLabel}>Recover to</span>
            <NexDropdownSingle
              dropdownId={recoverDropdownId}
              params={ledgerParams}
              clearOnParamsChange={false}
              advanceFocusOnSelect={false}
              value={state.recoverTo}
              onChange={state.setRecoverTo}
              disabled={disabled || !state.state.recoverEnabled}
              placeholder="a ledger (staff advance, party)"
              aria-label="Recover to"
              className={styles.dropdown}
            />
            <label className={styles.formLabel} htmlFor="settlement-wo-notes">
              Notes
            </label>
            <input
              id="settlement-wo-notes"
              className={styles.input}
              value={state.notes}
              maxLength={500}
              disabled={disabled}
              onChange={(event) => state.setNotes(event.target.value)}
            />
          </div>
          <div className={styles.formGrid} style={{ gridTemplateColumns: "minmax(0, 1fr)", alignContent: "start" }}>
            <p className={styles.note}>{WRITE_OFF_NOTE}</p>
            <div className={styles.panelButtons}>
              <button
                type="button"
                className={styles.primaryButton}
                disabled={!state.state.canWriteOff}
                title={WRITE_OFF_OVERRIDE_TITLE}
                onClick={() => void state.writeOff()}
              >
                {state.busy ? "Writing off…" : "Write off  (Ctrl+W)"}
              </button>
            </div>
            <p className={styles.code}>{state.posted}</p>
          </div>
        </div>
      </section>
    </div>
  );
}
