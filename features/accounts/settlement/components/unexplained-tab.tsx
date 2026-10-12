"use client";

/**
 * Unexplained — Qt tabUnexplained: provider lines no row explains (grid 141),
 * and the resolve panel — LINKED to a bill / REFUNDED / INCOME / SUSPENSE.
 * A line is resolved only once its payout is posted (its money sits in Tender
 * suspense). Needs OVERRIDE (stands in for SETTLEMENT_RESOLVE).
 */
import { useMemo } from "react";
import { cx } from "@/components/design-system/cx";
import { NexDropdownSingle } from "@/components/design-system/dropdown";
import { useDropdownId } from "@/lib/configured-dropdowns";
import {
  RESOLUTIONS,
  RESOLVE_NOTE,
  UNEXPLAINED_HINT,
  linkRowText,
  unexplainedFacts,
  unexplainedHead,
  type ReasonOption,
} from "../domain/exceptions";
import type { GridColumn } from "../domain/grid-columns";
import type { GridList } from "../hooks/use-grid-list";
import type { UnexplainedState } from "../hooks/use-exceptions";
import { GridTable } from "./grid-table";
import styles from "../page.module.scss";

export function UnexplainedTab({
  state,
  list,
  columns,
  reasons,
  companyId,
  hidden,
}: {
  state: UnexplainedState;
  list: GridList;
  columns: readonly GridColumn[];
  reasons: readonly ReasonOption[];
  companyId: string;
  hidden: boolean;
}) {
  // INCOME LEDGERS: what resolve INCOME accepts (a ledger under an Income group).
  const incomeDropdownId = useDropdownId("incomeLedger");
  const ledgerParams = useMemo(() => ({ icompany_id: companyId }), [companyId]);
  const row = state.row;
  const disabled = row === null || state.busy;

  return (
    <div className={styles.tabBody} hidden={hidden} role="tabpanel" aria-label="Unexplained">
      <p className={styles.hint}>{UNEXPLAINED_HINT}</p>
      <GridTable
        className={styles.gridGrow}
        columns={columns}
        rows={list.rows}
        loading={list.loading}
        error={list.error}
        current={state.current}
        onCurrent={state.setCurrent}
        emptyText="Every provider line has a row of ours."
        ariaLabel="Unexplained"
      />
      <section className={cx(styles.panel, row === null && styles.panelDisabled)} aria-label="Resolve">
        <div className={styles.decide}>
          <div className={styles.formGrid}>
            <span className={styles.decideHead} style={{ gridColumn: "1 / -1" }}>
              {unexplainedHead(row)}
            </span>
            {row ? (
              <span className={styles.muted} style={{ gridColumn: "1 / -1" }}>
                {unexplainedFacts(row)}
              </span>
            ) : null}
            <span className={styles.formLabel}>Resolve</span>
            <div className={styles.radios} role="radiogroup" aria-label="Resolve">
              {RESOLUTIONS.map((option) => (
                <label key={option.value} className={styles.radio}>
                  <input
                    type="radio"
                    name="settlement-resolve"
                    checked={state.resolution === option.value}
                    disabled={disabled}
                    onChange={() => state.setResolution(option.value)}
                  />
                  {option.label}
                </label>
              ))}
            </div>
            <label className={styles.formLabel} htmlFor="settlement-res-reason">
              Reason *
            </label>
            <select
              id="settlement-res-reason"
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
            <span className={styles.formLabel}>Income ledger</span>
            <NexDropdownSingle
              dropdownId={incomeDropdownId}
              params={ledgerParams}
              clearOnParamsChange={false}
              advanceFocusOnSelect={false}
              value={state.income}
              onChange={state.setIncome}
              disabled={disabled || !state.state.incomeEnabled}
              placeholder="an income ledger"
              aria-label="Income ledger"
              className={styles.dropdown}
            />
            <span className={styles.formLabel}>Our row</span>
            <div className={styles.inline}>
              <span className={state.linkRow ? undefined : styles.muted}>{linkRowText(state.linkRow)}</span>
              <span className={styles.spacer} />
              <button
                type="button"
                className={styles.button}
                disabled={disabled || !state.state.pickEnabled}
                onClick={state.pickLinkRow}
              >
                Pick row…
              </button>
            </div>
            <label className={styles.formLabel} htmlFor="settlement-res-notes">
              Notes
            </label>
            <input
              id="settlement-res-notes"
              className={styles.input}
              value={state.notes}
              maxLength={500}
              disabled={disabled}
              onChange={(event) => state.setNotes(event.target.value)}
            />
          </div>
          <div className={styles.formGrid} style={{ gridTemplateColumns: "minmax(0, 1fr)", alignContent: "start" }}>
            <p className={styles.note}>{RESOLVE_NOTE}</p>
            <div className={styles.panelButtons}>
              <button
                type="button"
                className={styles.primaryButton}
                disabled={!state.state.canResolve}
                title={state.state.title}
                onClick={() => void state.resolve()}
              >
                {state.busy ? "Resolving…" : "Resolve  (Ctrl+R)"}
              </button>
            </div>
            <p className={styles.code}>{state.posted}</p>
          </div>
        </div>
      </section>
    </div>
  );
}
