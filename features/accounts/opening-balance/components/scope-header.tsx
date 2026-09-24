"use client";

/**
 * The title bar: who this set belongs to, whether it balances, and the four
 * things that act on the whole set.
 *
 * Company, branch and year are CAPTURED from the session, not picked here.
 * `acc_opening_balance` is partitioned by `op_acc_year`, so a wrong year writes
 * into the wrong partition rather than merely the wrong row. The one choice on
 * offer is the scope combo, and even that asks before it throws work away.
 */
import type { Totals } from "../derived";
import { formatMoney } from "../derived";
import { SCOPE_DESCRIPTIONS, SCOPE_LABELS, type ScopeMode } from "../scope";
import styles from "../page.module.scss";

export type ScopeHeaderProps = {
  companyName: string;
  branchName: string;
  accYear: string;
  mode: ScopeMode;
  totals: Totals;
  dirty: boolean;
  busy: boolean;
  canCarryForward: boolean;
  onModeChange: (mode: ScopeMode) => void;
  onCarryForward: () => void;
  onCheckServer: () => void;
  onReload: () => void;
};

export function ScopeHeader(props: ScopeHeaderProps) {
  const {
    companyName,
    branchName,
    accYear,
    mode,
    totals,
    dirty,
    busy,
    canCarryForward,
    onModeChange,
    onCarryForward,
    onCheckServer,
    onReload,
  } = props;

  const scopeText = mode === "branch" ? branchName || "This branch" : "Company level";

  return (
    <header className={styles.titleBar}>
      <div className={styles.titleBlock}>
        <h1 className={styles.title}>
          Opening Balance{dirty ? <span className={styles.dirtyMark} aria-label="Unsaved changes"> •</span> : null}
        </h1>
        <p className={styles.subtitle}>
          {companyName || "—"} · {scopeText} · {accYear || "—"}
          <span className={styles.subtitleNote}> — {SCOPE_DESCRIPTIONS[mode]}</span>
        </p>
      </div>

      <div className={styles.titleActions}>
        <span
          className={`${styles.balancePill} ${
            totals.isBalanced ? styles.balancePillOk : styles.balancePillOut
          }`}
        >
          {totals.isBalanced ? "BALANCED" : `OUT BY ${formatMoney(Math.abs(totals.difference))}`}
        </span>

        <label className={styles.scopeCombo}>
          <span className={styles.scopeComboLabel}>Scope</span>
          <select
            className={styles.scopeComboSelect}
            value={mode}
            title={SCOPE_DESCRIPTIONS[mode]}
            onChange={(event) => onModeChange(event.target.value as ScopeMode)}
          >
            <option value="branch">{SCOPE_LABELS.branch}</option>
            <option value="company">{SCOPE_LABELS.company}</option>
          </select>
        </label>

        <button
          type="button"
          className={styles.secondaryButton}
          disabled={busy || !canCarryForward}
          onClick={onCarryForward}
          title={
            canCarryForward
              ? "Derive this year's openings from last year's closings"
              : "You do not have create rights on this screen"
          }
        >
          Carry forward
        </button>
        <button type="button" className={styles.secondaryButton} disabled={busy} onClick={onCheckServer}>
          Check against server
        </button>
        <button type="button" className={styles.secondaryButton} disabled={busy} onClick={onReload}>
          Reload
        </button>
      </div>
    </header>
  );
}
