"use client";
/**
 * More filters (F8, Ctrl+L): EVERY filter of the statement, and the only place
 * they are edited (the user's call, 2026-11-02, as on Party-wise Outstanding):
 * Ledger (with the picker's "Show deleted"), From – To, Branch and Show
 * (Report); Bill refs, Contra legs and Include cancelled (Include, asked of
 * the server); Narration and Running balance (Display, on screen only).
 *
 * It edits the screen's draft live, and the display switches act at once as
 * they always did; the screen keeps what they were when the popup opened, and
 * Cancel (or Esc, or the backdrop) puts all of it back. Apply runs Show when a
 * report filter changed. The frame and its keys are the shared FiltersPopup.
 */
import {
  FiltersChecks,
  FiltersColumn,
  FiltersNote,
  FiltersPopup,
  FiltersRow,
  FiltersSection,
} from "@/features/reports/shared/components/filters-popup";
import { DateInput } from "@/components/design-system/ui/date-input";
import { displayDate } from "@/features/reports/shared/wire/dates";
import styles from "../page.module.scss";
import type { LedgerStatementClient } from "../api/ledger-statement";
import type { Filters } from "../query/params";
import type { ErrorField } from "../wire/errors";
import type { LedgerPickItem } from "../wire/types";
import { LedgerPicker } from "./ledger-picker";

/** What More filters edits: the report filters, the ledger with its name. */
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

/**
 * The strip's line. `head` always says the statement's subject (the ledger,
 * the period, the branch — nothing else on the screen does); `extra` is each
 * switch away from its default, and is what "More filters (n)" counts.
 */
export function appliedFilters(
  f: Filters,
  display: DisplaySwitches,
  names: { ledger: string; branch: string },
): { head: string[]; extra: string[] } {
  const head = f.ledgerId
    ? [names.ledger || "(one ledger)", `${displayDate(f.fromDate)} – ${displayDate(f.toDate)}`, names.branch]
    : [];
  const extra: string[] = [];
  if (!f.withBillRefs) extra.push("No bill refs");
  if (f.withLegs) extra.push("Contra legs");
  if (!f.includeCancelled) extra.push("Cancelled hidden");
  if (!display.narration) extra.push("Narration hidden");
  if (!display.runningBalance) extra.push("No running balance");
  return { head, extra };
}

type Props = {
  client: LedgerStatementClient;
  companyId: string;
  draft: Draft;
  onDraft: (patch: Partial<Draft>) => void;
  onPickLedger: (item: LedgerPickItem) => void;
  /** The picker's "Show deleted" tick (party rules D1-7). Picker only: not a report filter. */
  showDeletedLedgers: boolean;
  onShowDeletedLedgers: (value: boolean) => void;
  display: DisplaySwitches;
  onDisplay: (patch: Partial<DisplaySwitches>) => void;
  branches: Array<{ value: string; label: string }>;
  yearBegin: string | null;
  yearEnd: string | null;
  flagged: ErrorField;
  /** The screen's own check, when Apply was refused. */
  error: string | null;
  onApply: () => void;
  onReset: () => void;
  onCancel: () => void;
};

export function MoreFiltersDialog({
  client,
  companyId,
  draft,
  onDraft,
  onPickLedger,
  showDeletedLedgers,
  onShowDeletedLedgers,
  display,
  onDisplay,
  branches,
  yearBegin,
  yearEnd,
  flagged,
  error,
  onApply,
  onReset,
  onCancel,
}: Props) {
  return (
    <FiltersPopup
      error={error}
      onApply={onApply}
      onReset={onReset}
      onCancel={onCancel}
      panelClassName={styles.filtersPanel}
      // The Ledger is what the statement is OF: the cursor starts there.
      onMounted={(panel) => panel.querySelector<HTMLInputElement>('input[role="combobox"]')?.focus()}
    >
      <FiltersSection title="Report">
        {/* A span caption, not a label: the picker holds a button, and a label would re-route its clicks. */}
        <FiltersRow label="Ledger" required flagged={flagged === "ledger"} flaggedClassName={styles.fieldFlagged}>
          <div className={styles.ledgerPicker}>
            <LedgerPicker
              client={client}
              companyId={companyId}
              value={draft.ledger}
              onPick={onPickLedger}
              includeDeleted={showDeletedLedgers}
              invalid={flagged === "ledger"}
            />
          </div>
        </FiltersRow>
        <span />
        <label
          className={styles.check}
          title="List deleted parties too, marked (deleted). Their statement opens read-only."
        >
          <input
            type="checkbox"
            checked={showDeletedLedgers}
            onChange={(event) => onShowDeletedLedgers(event.target.checked)}
          />
          Show deleted ledgers
        </label>
        <FiltersRow label="From – To" flagged={flagged === "dates"} flaggedClassName={styles.fieldFlagged}>
          <span className={styles.dateBox}>
            <DateInput
              block
              aria-label="From"
              className={styles.input}
              value={draft.fromDate}
              min={yearBegin ?? undefined}
              max={yearEnd ?? undefined}
              onChange={(value) => onDraft({ fromDate: value })}
            />
          </span>
          –
          <span className={styles.dateBox}>
            <DateInput
              block
              aria-label="To"
              className={styles.input}
              value={draft.toDate}
              min={yearBegin ?? undefined}
              max={yearEnd ?? undefined}
              onChange={(value) => onDraft({ toDate: value })}
            />
          </span>
        </FiltersRow>
        <FiltersRow
          label="Branch"
          htmlFor="ls-more-branch"
          flagged={flagged === "branch"}
          flaggedClassName={styles.fieldFlagged}
        >
          <select
            id="ls-more-branch"
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
        </FiltersRow>
        <FiltersRow label="Show" htmlFor="ls-more-show">
          <select id="ls-more-show" className={styles.select} value="DETAILED" disabled title="Condensed arrives later">
            <option value="DETAILED">Detailed</option>
            <option value="CONDENSED" disabled>
              Condensed
            </option>
          </select>
        </FiltersRow>
      </FiltersSection>

      <FiltersColumn>
        <FiltersSection title="Include">
          <FiltersChecks single>
            <label className={styles.check} title="Asks the server for the bills each voucher settled.">
              <input
                type="checkbox"
                checked={draft.withBillRefs}
                onChange={(event) => onDraft({ withBillRefs: event.target.checked })}
              />
              Bill refs
            </label>
            <label
              className={styles.check}
              title="Every 'as per details' row arrives with its legs expanded. Alt+F1 shows one row's legs any time."
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
              title="Off hides a cancelled pair (both halves), and the server keeps the running balance right."
            >
              <input
                type="checkbox"
                checked={draft.includeCancelled}
                onChange={(event) => onDraft({ includeCancelled: event.target.checked })}
              />
              Include cancelled
            </label>
          </FiltersChecks>
          <FiltersNote>Asked of the server: they take effect on Apply.</FiltersNote>
        </FiltersSection>

        <FiltersSection title="Display">
          <FiltersChecks single>
            <label className={styles.check} title="Shows the narration beside the bill refs">
              <input
                type="checkbox"
                checked={display.narration}
                onChange={(event) => onDisplay({ narration: event.target.checked })}
              />
              Narration
            </label>
            <label className={styles.check} title="Shows or hides the Balance column">
              <input
                type="checkbox"
                checked={display.runningBalance}
                onChange={(event) => onDisplay({ runningBalance: event.target.checked })}
              />
              Running balance
            </label>
          </FiltersChecks>
          <FiltersNote>On screen only: they act at once.</FiltersNote>
        </FiltersSection>
      </FiltersColumn>
    </FiltersPopup>
  );
}
