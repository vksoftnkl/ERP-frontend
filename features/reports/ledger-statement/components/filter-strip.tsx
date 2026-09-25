"use client";
/**
 * The filter strip (plan §6): Ledger, From, To, Branch, Show, the five
 * checkboxes, and Show (F5).
 *
 * Editing a filter does NOT fetch. Show writes the URL, and the URL change is
 * what fetches. Three checkboxes are SERVER parameters and wait for Show like
 * any filter. Narration and Running balance are display switches and act at
 * once.
 */
import type { MutableRefObject } from "react";
import { cx } from "@/components/design-system/cx";
import styles from "../page.module.scss";
import type { LedgerStatementClient } from "../api/ledger-statement";
import type { ErrorField } from "../wire/errors";
import type { LedgerPickItem } from "../wire/types";
import { LedgerPicker } from "./ledger-picker";

export type Draft = {
  ledger: { id: string; text: string } | null;
  fromDate: string;
  toDate: string;
  /** null = All branches (combined). */
  branchId: string | null;
  includeCancelled: boolean;
  withBillRefs: boolean;
  withLegs: boolean;
};

export type DisplaySwitches = { narration: boolean; runningBalance: boolean };

export const ALL_BRANCHES_TIP =
  "Every branch combined: the sum of every opening set (company-level and each branch's) and every " +
  "branch's vouchers. Not the same as 'All branches' on the Opening Balance screen, which is the " +
  "company-level set alone.";

type Props = {
  client: LedgerStatementClient;
  companyId: string;
  draft: Draft;
  onDraft: (patch: Partial<Draft>) => void;
  onPickLedger: (item: LedgerPickItem) => void;
  display: DisplaySwitches;
  onDisplay: (patch: Partial<DisplaySwitches>) => void;
  branches: Array<{ value: string; label: string }>;
  yearBegin: string | null;
  yearEnd: string | null;
  flagged: ErrorField;
  onShow: () => void;
  ledgerInputRef: MutableRefObject<HTMLInputElement | null>;
};

export function FilterStrip({
  client,
  companyId,
  draft,
  onDraft,
  onPickLedger,
  display,
  onDisplay,
  branches,
  yearBegin,
  yearEnd,
  flagged,
  onShow,
  ledgerInputRef,
}: Props) {
  return (
    <div className={styles.strip} role="search" aria-label="Report filters">
      {/* A div, not a label: the picker holds a button, and a label would re-route its clicks. */}
      <div className={cx(styles.field, styles.fieldLedger, flagged === "ledger" && styles.fieldFlagged)}>
        <span className={styles.fieldLabel}>
          Ledger <span className={styles.required}>*</span>
        </span>
        <div className={styles.ledgerPicker}>
          <LedgerPicker
            client={client}
            companyId={companyId}
            value={draft.ledger}
            onPick={onPickLedger}
            invalid={flagged === "ledger"}
            inputRef={ledgerInputRef}
          />
        </div>
      </div>

      <label className={cx(styles.field, styles.fieldDate, flagged === "dates" && styles.fieldFlagged)}>
        <span className={styles.fieldLabel}>From</span>
        <input
          type="date"
          className={styles.input}
          value={draft.fromDate}
          min={yearBegin ?? undefined}
          max={yearEnd ?? undefined}
          onChange={(event) => onDraft({ fromDate: event.target.value })}
        />
      </label>
      <label className={cx(styles.field, styles.fieldDate, flagged === "dates" && styles.fieldFlagged)}>
        <span className={styles.fieldLabel}>To</span>
        <input
          type="date"
          className={styles.input}
          value={draft.toDate}
          min={yearBegin ?? undefined}
          max={yearEnd ?? undefined}
          onChange={(event) => onDraft({ toDate: event.target.value })}
        />
      </label>

      <label className={cx(styles.field, styles.fieldBranch, flagged === "branch" && styles.fieldFlagged)}>
        <span className={styles.fieldLabel}>Branch</span>
        <select
          className={styles.select}
          value={draft.branchId ?? "all"}
          title={draft.branchId ? undefined : ALL_BRANCHES_TIP}
          onChange={(event) => onDraft({ branchId: event.target.value === "all" ? null : event.target.value })}
        >
          <option value="all" title={ALL_BRANCHES_TIP}>
            All branches (combined)
          </option>
          {branches.map((branch) => (
            <option key={branch.value} value={branch.value}>
              {branch.label}
            </option>
          ))}
        </select>
      </label>

      <label className={cx(styles.field, styles.fieldShow)}>
        <span className={styles.fieldLabel}>Show</span>
        <select className={styles.select} value="DETAILED" disabled title="Condensed arrives later">
          <option value="DETAILED">Detailed</option>
          <option value="CONDENSED" disabled>
            Condensed
          </option>
        </select>
      </label>

      <div className={styles.checks}>
        <label className={styles.check} title="Display only: shows the narration beside the bill refs">
          <input
            type="checkbox"
            checked={display.narration}
            onChange={(event) => onDisplay({ narration: event.target.checked })}
          />
          Narration
        </label>
        <label className={styles.check} title="Asks the server for the bills each voucher settled. Takes effect on Show.">
          <input
            type="checkbox"
            checked={draft.withBillRefs}
            onChange={(event) => onDraft({ withBillRefs: event.target.checked })}
          />
          Bill refs
        </label>
        <label
          className={styles.check}
          title="Every 'as per details' row arrives with its legs expanded. Takes effect on Show. Alt+F1 shows one row's legs any time."
        >
          <input
            type="checkbox"
            checked={draft.withLegs}
            onChange={(event) => onDraft({ withLegs: event.target.checked })}
          />
          Contra legs <span className={styles.checkKind}>Alt+F1</span>
        </label>
        <label
          className={styles.check}
          title="Off hides a cancelled pair (both halves), and the server keeps the running balance right. Takes effect on Show."
        >
          <input
            type="checkbox"
            checked={draft.includeCancelled}
            onChange={(event) => onDraft({ includeCancelled: event.target.checked })}
          />
          Include cancelled
        </label>
        <label className={styles.check} title="Display only: shows or hides the Balance column">
          <input
            type="checkbox"
            checked={display.runningBalance}
            onChange={(event) => onDisplay({ runningBalance: event.target.checked })}
          />
          Running balance
        </label>
      </div>

      <div className={styles.stripSpacer} />
      <button type="button" className={styles.primaryButton} onClick={onShow}>
        Show<span className={styles.key}>F5</span>
      </button>
    </div>
  );
}
