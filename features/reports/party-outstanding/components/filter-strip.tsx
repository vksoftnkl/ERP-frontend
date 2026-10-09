"use client";
/**
 * The filter strip (plan §6): Side, Group, Area, Branch, As on, Show (row 1);
 * Age by, Buckets, the four checkboxes, More filters (row 2).
 *
 * Editing a filter does NOT fetch. Show writes the URL, and the URL change is
 * what fetches. Unlike the ledger statement there are no display-only
 * switches: each checkbox changes which rows exist or what the totals are, so
 * each waits for Show like any other filter.
 *
 * The combos are the house `SearchableSelect` over THIS feature's `/options`.
 * No dropdown id, no grid runner.
 */
import { useMemo, type MutableRefObject } from "react";
import { cx } from "@/components/design-system/cx";
import { SearchableSelect } from "@/components/design-system/ui";
import styles from "../page.module.scss";
import type { ReportFilters } from "../query/params";
import type { ErrorField } from "../wire/errors";
import type { OptionsPayload, OutstandingSide } from "../wire/types";

/** What the strip edits: the report filters, with Buckets as typed. */
export type Draft = Omit<ReportFilters, "buckets"> & { bucketsText: string };

export const AS_ON_TIP =
  "As on decides the year, the bills, what is pending and every age. Figures are as the books stand today: " +
  "a receipt cancelled later changes an earlier date's figure.";

const DEFAULT_GROUP = "";
const ALL = "all";

type Props = {
  draft: Draft;
  onDraft: (patch: Partial<Draft>) => void;
  onSide: (side: OutstandingSide) => void;
  options: OptionsPayload | null;
  /** Until `/options` answers, the session's branches stand in. */
  fallbackBranches: ReadonlyArray<{ value: string; label: string }>;
  flagged: ErrorField;
  onShow: () => void;
  onMoreFilters: () => void;
  moreCount: number;
  asOnRef: MutableRefObject<HTMLInputElement | null>;
};

export function FilterStrip({
  draft,
  onDraft,
  onSide,
  options,
  fallbackBranches,
  flagged,
  onShow,
  onMoreFilters,
  moreCount,
  asOnRef,
}: Props) {
  const receivable = draft.side === "RECEIVABLE";

  const groupOptions = useMemo(() => {
    const groups = options?.groups ?? [];
    return groups.map((group, i) => {
      const hasChildren = (groups[i + 1]?.depth ?? -1) > group.depth;
      const indent = "   ".repeat(Math.max(0, group.depth));
      const label = `${indent}${group.name}${hasChildren ? "  (+ sub-groups)" : ""}`;
      return { value: group.isDefault ? DEFAULT_GROUP : group.groupId, label };
    });
  }, [options]);
  // Before /options, the default group still reads as itself.
  const groupChoices = groupOptions.length
    ? groupOptions
    : [{ value: DEFAULT_GROUP, label: receivable ? "Sundry Debtors  (+ sub-groups)" : "Sundry Creditors  (+ sub-groups)" }];

  const areaOptions = useMemo(
    () => [{ value: "", label: "All areas" }, ...(options?.areas ?? []).map((a) => ({ value: a.areaId, label: a.name }))],
    [options],
  );
  const branchOptions = useMemo(
    () =>
      options
        ? options.branches.map((b) => ({ value: b.branchId, label: b.name }))
        : fallbackBranches.map((b) => ({ value: b.value, label: b.label })),
    [fallbackBranches, options],
  );

  return (
    <div className={styles.strip} role="search" aria-label="Report filters">
      <div className={styles.stripRow}>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>
            Side <span className={styles.required}>*</span>
          </span>
          <select
            className={styles.select}
            value={draft.side}
            onChange={(event) => onSide(event.target.value as OutstandingSide)}
          >
            <option value="RECEIVABLE">Receivable</option>
            <option value="PAYABLE">Payable</option>
          </select>
        </label>

        {/* Divs, not labels: the combos hold buttons, and a label would re-route their clicks. */}
        <div className={styles.field}>
          <span className={styles.fieldLabel}>Group</span>
          <div className={styles.comboWide}>
            <SearchableSelect
              value={draft.groupId ?? DEFAULT_GROUP}
              options={groupChoices}
              onChange={(value) => onDraft({ groupId: value || null })}
              searchPlaceholder="Find a group"
            />
          </div>
        </div>

        {receivable ? (
          <div className={styles.field}>
            <span className={styles.fieldLabel}>Area</span>
            <div className={styles.combo}>
              <SearchableSelect
                value={draft.areaId ?? ""}
                options={areaOptions}
                onChange={(value) => onDraft({ areaId: value || null })}
                searchPlaceholder="Find an area"
              />
            </div>
          </div>
        ) : null}

        <label className={cx(styles.field, flagged === "branch" && styles.fieldFlagged)}>
          <span className={styles.fieldLabel}>Branch</span>
          <select
            className={styles.select}
            value={draft.branchId ?? ALL}
            onChange={(event) => onDraft({ branchId: event.target.value === ALL ? null : event.target.value })}
          >
            <option value={ALL}>All branches (combined)</option>
            {branchOptions.map((branch) => (
              <option key={branch.value} value={branch.value}>
                {branch.label}
              </option>
            ))}
          </select>
        </label>

        <label className={cx(styles.field, flagged === "asOn" && styles.fieldFlagged)} title={AS_ON_TIP}>
          <span className={styles.fieldLabel}>As on</span>
          <input
            ref={asOnRef}
            type="date"
            className={cx(styles.input, styles.inputDate)}
            value={draft.asOn}
            onChange={(event) => onDraft({ asOn: event.target.value })}
          />
        </label>

        <div className={styles.stripSpacer} />
        <button type="button" className={styles.primaryButton} onClick={onShow}>
          Show<span className={styles.key}>F5</span>
        </button>
      </div>

      <div className={styles.stripRow}>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Age by</span>
          <select
            className={styles.select}
            value={draft.ageBy}
            onChange={(event) => onDraft({ ageBy: event.target.value === "DUE_DATE" ? "DUE_DATE" : "BILL_DATE" })}
          >
            <option value="BILL_DATE">Bill date</option>
            <option value="DUE_DATE">Due date</option>
          </select>
        </label>

        <label
          className={cx(styles.field, flagged === "buckets" && styles.fieldFlagged)}
          title="Rising whole numbers of days: 30 60 90 180 gives 0–30 · 31–60 · 61–90 · 91–180 · > 180."
        >
          <span className={styles.fieldLabel}>Buckets</span>
          <input
            className={cx(styles.input, styles.inputBuckets)}
            value={draft.bucketsText}
            onChange={(event) => onDraft({ bucketsText: event.target.value })}
            data-uppercase="off"
            inputMode="numeric"
          />
        </label>

        <label className={styles.check} title="Parties with something overdue; on the bills, overdue bills only.">
          <input
            type="checkbox"
            checked={draft.onlyOverdue}
            onChange={(event) => onDraft({ onlyOverdue: event.target.checked })}
          />
          Only overdue
        </label>
        <label className={styles.check} title="Advances, returns and unadjusted notes. Off drops them from every figure.">
          <input
            type="checkbox"
            checked={draft.includeOnAccount}
            onChange={(event) => onDraft({ includeOnAccount: event.target.checked })}
          />
          Show on-account / advances
        </label>
        <label className={styles.check} title="Subtract post-dated cheques in hand (not yet effective) from Net.">
          <input
            type="checkbox"
            checked={draft.deductPdc}
            onChange={(event) => onDraft({ deductPdc: event.target.checked })}
          />
          Deduct PDC
        </label>
        <label className={styles.check} title="Drop parties with nothing pending either way on As on.">
          <input
            type="checkbox"
            checked={draft.hideZero}
            onChange={(event) => onDraft({ hideZero: event.target.checked })}
          />
          Hide zero balance
        </label>
        <button type="button" className={styles.button} onClick={onMoreFilters}>
          More filters{moreCount > 0 ? ` (${moreCount})` : ""}
          <span className={styles.key}>F8</span>
        </button>

        <div className={styles.stripSpacer} />
        <span className={styles.stripHint}>
          Ctrl+L ledger statement · Ctrl+R {receivable ? "receipt" : "payment"}
        </span>
      </div>
    </div>
  );
}
