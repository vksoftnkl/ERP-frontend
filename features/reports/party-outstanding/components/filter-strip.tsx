"use client";
/**
 * The filter strip (plan §6): Side, Group, Area, Ledger name, Branch, As on, Show
 * (row 1); Age by, Buckets, the four checkboxes, More filters (row 2).
 *
 * Editing a filter does NOT fetch. Show writes the URL, and the URL change is
 * what fetches. Unlike the ledger statement there are no display-only
 * switches: each checkbox changes which rows exist or what the totals are, so
 * each waits for Show like any other filter.
 *
 * Ledger name (the plan's Party) is the one exception: picking one runs Show
 * at once (as More filters' Apply did when Party lived there), because it is a
 * find — Ctrl+F, type, Enter.
 *
 * The combos are the house `SearchableSelect` over THIS feature's `/options`
 * and, for Party, its own `/parties` (`query/party-choices.ts`). No dropdown
 * id, no grid runner.
 */
import { useMemo, type MutableRefObject } from "react";
import { cx } from "@/components/design-system/cx";
import { SearchableSelect } from "@/components/design-system/ui";
import styles from "../page.module.scss";
import type { ReportFilters } from "../query/params";
import type { PartyChoice } from "../query/party-choices";
import type { ErrorField } from "../wire/errors";
import type { OptionsPayload, OutstandingSide } from "../wire/types";
import { DateInput } from "@/components/design-system/ui/date-input";

/** What the strip edits: the report filters, with Buckets as typed. */
export type Draft = Omit<ReportFilters, "buckets"> & { bucketsText: string };

export const AS_ON_TIP =
  "As on decides the year, the bills, what is pending and every age. Figures are as the books stand today: " +
  "a receipt cancelled later changes an earlier date's figure.";

const DEFAULT_GROUP = "";
const ALL = "all";
const ALL_PARTIES = "";

/** The Party combo: its list (fetched on first open), and what picking does. */
export type PartyPicker = {
  choices: PartyChoice[] | null;
  loading: boolean;
  error: string | null;
  truncated: boolean;
  /** The picked party's name when the list has not been loaded (a link, a Back). */
  currentName: string | null;
  request: () => void;
  onPick: (partyId: string | null) => void;
};

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
  party: PartyPicker;
  /** The Party combo's box, for Ctrl+F. */
  partyRef: MutableRefObject<HTMLDivElement | null>;
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
  party,
  partyRef,
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
  const partyOptions = useMemo(() => {
    const list = party.choices ?? [];
    const picked = draft.partyId;
    const head = [{ value: ALL_PARTIES, label: "All ledgers" }];
    if (picked && !list.some((choice) => choice.partyId === picked)) {
      head.push({ value: picked, label: party.currentName || "(the ledger in the link)" });
    }
    return [...head, ...list.map((choice) => ({ value: choice.partyId, label: choice.name }))];
  }, [draft.partyId, party.choices, party.currentName]);
  const partyEmpty = party.error
    ? `The ledgers could not be loaded: ${party.error}`
    : party.loading || !party.choices
      ? "Loading ledgers…"
      : "No ledger matches.";
  const partyTip = party.truncated
    ? "Only the first ledgers A–Z are listed. Narrow Group, Area or Branch to find the rest. Ctrl+F opens it."
    : "The ledgers of this report, by ledger name A–Z. Picking one shows the report for it at once. Ctrl+F opens it.";

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

        <div className={styles.field} title={partyTip}>
          <span className={styles.fieldLabel}>Ledger name</span>
          {/* Capture: the list is asked for on the first open, before the combo sees the click. */}
          <div
            ref={partyRef}
            className={styles.comboWide}
            onMouseDownCapture={party.request}
            onFocusCapture={party.request}
          >
            <SearchableSelect
              value={draft.partyId ?? ALL_PARTIES}
              options={partyOptions}
              onChange={(value) => party.onPick(value || null)}
              searchPlaceholder="Find a ledger"
              emptyText={partyEmpty}
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
          <DateInput
            ref={asOnRef}
            className={cx(styles.input, styles.inputDate)}
            value={draft.asOn}
            onChange={(value) => onDraft({ asOn: value })}
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
          Ctrl+F find ledger · Ctrl+L ledger statement · Ctrl+R {receivable ? "receipt" : "payment"}
        </span>
      </div>
    </div>
  );
}
