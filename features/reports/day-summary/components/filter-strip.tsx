"use client";
/**
 * The filter strip (plan §6): ◀ Date ▶, To, Company, Branch, Type, Show (row
 * 1); the four checkboxes and the key hint (row 2).
 *
 * Editing a filter does NOT fetch: Show (F5) writes the URL, and the URL
 * change fetches. The four checkboxes are server parameters too, so a change
 * only arms Show; "Count drafts" is the one display switch, and its tooltip
 * says so. Two exceptions, both from the plan: ◀ ▶ step and show at once,
 * and Company switches the SESSION (the header switcher's action), so it is
 * never a URL key.
 *
 * The date edits are clamped to the session's fiscal year; the server still
 * refuses (`RANGE_OUTSIDE_YEAR`).
 */
import { useMemo, type MutableRefObject } from "react";
import { cx } from "@/components/design-system/cx";
import { SearchableSelect } from "@/components/design-system/ui";
import styles from "../page.module.scss";
import { parseTypeId, type Step } from "../query/params";
import type { ErrorField } from "../wire/errors";
import type { VoucherTypeOption } from "../wire/types";

/** What the strip edits: the filters Show applies. */
export type Draft = {
  fromDate: string;
  toDate: string;
  branchId: string | null;
  voucherTypeId: number | null;
  countDrafts: boolean;
  includeCancelledPairs: boolean;
  clearingAsBank: boolean;
  zeroRows: boolean;
};

type Option = { value: string; label: string };

type Props = {
  draft: Draft;
  onDraft: (patch: Partial<Draft>) => void;
  onStep: (dir: Step) => void;
  canStep: { back: boolean; forward: boolean };
  yearBegin: string | null;
  yearEnd: string | null;
  companies: readonly Option[];
  companyId: string;
  onCompany: (companyId: string) => void;
  companyLocked: boolean;
  branches: readonly Option[];
  voucherTypes: readonly VoucherTypeOption[] | null;
  flagged: ErrorField;
  onShow: () => void;
  dateRef: MutableRefObject<HTMLInputElement | null>;
};

const ALL = "all";

export function FilterStrip({
  draft,
  onDraft,
  onStep,
  canStep,
  yearBegin,
  yearEnd,
  companies,
  companyId,
  onCompany,
  companyLocked,
  branches,
  voucherTypes,
  flagged,
  onShow,
  dateRef,
}: Props) {
  const typeOptions = useMemo(
    () => [
      { value: "", label: "All voucher types" },
      ...(voucherTypes ?? []).map((t) => ({ value: String(t.voucherTypeId), label: `${t.name} (${t.short})` })),
    ],
    [voucherTypes],
  );
  // A type in the link that the list has not brought (yet) still reads as itself.
  const typeChoices =
    draft.voucherTypeId !== null && !typeOptions.some((o) => o.value === String(draft.voucherTypeId))
      ? [...typeOptions, { value: String(draft.voucherTypeId), label: `Type ${draft.voucherTypeId}` }]
      : typeOptions;

  /** Date moves To along while the report is one day; a range keeps its To unless it would reverse. */
  const onDate = (value: string) => {
    const single = draft.toDate === draft.fromDate;
    onDraft({ fromDate: value, toDate: single || draft.toDate < value ? value : draft.toDate });
  };

  const datesFlagged = flagged === "dates";

  return (
    <div className={styles.strip} role="search" aria-label="Report filters">
      <div className={styles.stripRow}>
        <div className={cx(styles.field, datesFlagged && styles.fieldFlagged)}>
          <span className={styles.fieldLabel}>
            Date <span className={styles.required}>*</span>
          </span>
          <button
            type="button"
            className={styles.dayButton}
            onClick={() => onStep(-1)}
            disabled={!canStep.back}
            title="Previous day (Alt+←)"
            aria-label="Previous day"
          >
            ◀
          </button>
          <input
            ref={dateRef}
            type="date"
            className={cx(styles.input, styles.inputDate)}
            value={draft.fromDate}
            min={yearBegin ?? undefined}
            max={yearEnd ?? undefined}
            onChange={(event) => onDate(event.target.value)}
            aria-label="Date"
          />
          <button
            type="button"
            className={styles.dayButton}
            onClick={() => onStep(1)}
            disabled={!canStep.forward}
            title="Next day (Alt+→)"
            aria-label="Next day"
          >
            ▶
          </button>
        </div>

        <label className={cx(styles.field, datesFlagged && styles.fieldFlagged)}>
          <span className={styles.fieldLabel}>To</span>
          <input
            type="date"
            className={cx(styles.input, styles.inputDate)}
            value={draft.toDate}
            min={draft.fromDate || yearBegin || undefined}
            max={yearEnd ?? undefined}
            onChange={(event) => onDraft({ toDate: event.target.value })}
          />
        </label>

        {/* Divs, not labels: the combos hold buttons, and a label would re-route their clicks. */}
        <div className={styles.field} title="Switches the session's company, as the header does">
          <span className={styles.fieldLabel}>Company</span>
          <div className={styles.comboWide}>
            <SearchableSelect
              value={companyId}
              options={companies}
              onChange={(value) => {
                if (value && value !== companyId) onCompany(value);
              }}
              disabled={companyLocked}
              searchPlaceholder="Find a company"
            />
          </div>
        </div>

        <label className={cx(styles.field, flagged === "branch" && styles.fieldFlagged)}>
          <span className={styles.fieldLabel}>Branch</span>
          <select
            className={styles.select}
            value={draft.branchId ?? ALL}
            onChange={(event) => onDraft({ branchId: event.target.value === ALL ? null : event.target.value })}
          >
            <option value={ALL}>All branches</option>
            {branches.map((branch) => (
              <option key={branch.value} value={branch.value}>
                {branch.label}
              </option>
            ))}
          </select>
        </label>

        <div className={cx(styles.field, flagged === "type" && styles.fieldFlagged)}>
          <span className={styles.fieldLabel}>Type</span>
          <div className={styles.combo}>
            <SearchableSelect
              value={draft.voucherTypeId === null ? "" : String(draft.voucherTypeId)}
              options={typeChoices}
              onChange={(value) => onDraft({ voucherTypeId: parseTypeId(value) })}
              searchPlaceholder="Find a voucher type"
            />
          </div>
        </div>

        <div className={styles.stripSpacer} />
        <button type="button" className={styles.primaryButton} onClick={onShow}>
          Show<span className={styles.key}>F5</span>
        </button>
      </div>

      <div className={styles.stripRow}>
        <label
          className={styles.check}
          title="Display only: shows the Draft column, the draft counts and the drafts check. The server always counts drafts; it never sums them."
        >
          <input type="checkbox" checked={draft.countDrafts} onChange={(e) => onDraft({ countDrafts: e.target.checked })} />
          Count drafts
        </label>
        <label
          className={styles.check}
          title="On the Vouchers tab: list both halves of a cancel made inside the dates. The summary always leaves such pairs out (they net to zero)."
        >
          <input
            type="checkbox"
            checked={draft.includeCancelledPairs}
            onChange={(e) => onDraft({ includeCancelledPairs: e.target.checked })}
          />
          Include cancelled pairs
        </label>
        <label className={styles.check} title="Fold card / UPI clearing ledgers into the Bank in / out columns.">
          <input
            type="checkbox"
            checked={draft.clearingAsBank}
            onChange={(e) => onDraft({ clearingAsBank: e.target.checked })}
          />
          Clearing ledgers as bank
        </label>
        <label className={styles.check} title="Also list voucher types, money ledgers and days with nothing in range.">
          <input type="checkbox" checked={draft.zeroRows} onChange={(e) => onDraft({ zeroRows: e.target.checked })} />
          Zero rows
        </label>
        <div className={styles.stripSpacer} />
        <span className={styles.stripHint}>Alt+←/→  previous / next day   ·   To &gt; Date  =  a range, summed</span>
      </div>
    </div>
  );
}
