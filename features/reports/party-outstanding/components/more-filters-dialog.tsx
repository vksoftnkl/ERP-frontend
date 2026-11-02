"use client";
/**
 * More filters (F8): EVERY filter of the report, and the only place they are
 * edited — Side, As on, Branch, Age by, Buckets, Due days ≥ / ≤ (Report);
 * Group, Area, Ledger name, Salesman, Collection day (Parties); the four
 * switches (Include). The user's call, 2026-11-02: the strip holds none.
 *
 * It edits the screen's DRAFT, live, so the Group / Area / Ledger lists follow
 * a Side picked here exactly as they follow the strip's. The screen keeps the
 * draft as it was when the popup opened: Cancel (or Esc, or the backdrop) puts
 * it back. Reset sets the report's defaults (the Side stays). Apply (Enter,
 * F5) runs Show; a filter the client's own check refuses keeps the popup open
 * with the message and the field marked.
 *
 * Opened by F8, a Ledger name pick is one filter among the rest, and Apply
 * runs them together. Opened by Ctrl+F (`findLedger`), the Ledger list opens
 * on its search and a pick runs Show at once — a find: Ctrl+F, type, Enter.
 *
 * The overlay is the house three-part one (ModalPortal, an isolated overlay
 * with no background, its own backdrop, a pre-promoted panel), so the grid
 * behind it cannot ghost through.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import ModalPortal from "@/components/ui/modal-portal";
import { cx } from "@/components/design-system/cx";
import { SearchableSelect } from "@/components/design-system/ui";
import { DateInput } from "@/components/design-system/ui/date-input";
import { Z_MODAL } from "@/lib/z-index";
import styles from "../page.module.scss";
import type { ErrorField } from "../wire/errors";
import { COLLECTION_DAYS, type CollectionDay, type OptionsPayload, type OutstandingSide } from "../wire/types";
import { bucketsText, DEFAULT_BUCKETS, type ReportFilters } from "../query/params";
import {
  ALL_BRANCHES,
  ALL_PARTIES,
  AS_ON_TIP,
  BUCKETS_TIP,
  DEFAULT_GROUP,
  SWITCHES,
  useFilterChoices,
  type Draft,
  type FallbackBranches,
  type PartyPicker,
} from "./filter-choices";

const DAY_NAMES: Record<CollectionDay, string> = {
  MON: "Mon",
  TUE: "Tue",
  WED: "Wed",
  THU: "Thu",
  FRI: "Fri",
  SAT: "Sat",
  SUN: "Sun",
};

export function dayName(day: CollectionDay): string {
  return DAY_NAMES[day];
}

export type FilterNames = {
  group: (id: string) => string | null;
  area: (id: string) => string | null;
  ledger: (id: string) => string | null;
  salesman: (id: string) => string | null;
};

/**
 * Every applied filter that is not at its default, one phrase each, for the
 * strip's line and its "More filters (n)". Side, As on and Branch are left
 * out: the title's subtitle always says them.
 */
export function appliedFilters(f: ReportFilters, names: FilterNames): string[] {
  const parts: string[] = [];
  if (f.groupId) parts.push(`Group: ${names.group(f.groupId) ?? "(one group)"}`);
  if (f.areaId) parts.push(`Area: ${names.area(f.areaId) ?? "(one area)"}`);
  if (f.partyId) parts.push(`Ledger: ${names.ledger(f.partyId) ?? "(one ledger)"}`);
  if (f.salesmanId) parts.push(`Salesman: ${names.salesman(f.salesmanId) ?? "(one salesman)"}`);
  if (f.collectionDay) parts.push(`Collection: ${dayName(f.collectionDay)}`);
  if (f.minDueDays !== null && f.maxDueDays !== null) {
    parts.push(`Due days ${f.minDueDays} – ${f.maxDueDays}`);
  } else if (f.minDueDays !== null) {
    parts.push(`Due days ≥ ${f.minDueDays}`);
  } else if (f.maxDueDays !== null) {
    parts.push(`Due days ≤ ${f.maxDueDays}`);
  }
  if (f.ageBy === "DUE_DATE") parts.push("Age by due date");
  if (f.buckets !== DEFAULT_BUCKETS) parts.push(`Buckets ${bucketsText(f.buckets)}`);
  if (f.onlyOverdue) parts.push("Only overdue");
  if (!f.includeOnAccount) parts.push("No on-account / advances");
  if (f.deductPdc) parts.push("PDC deducted");
  if (!f.hideZero) parts.push("Zero balances shown");
  return parts;
}

function days(text: string): number | null {
  const trimmed = text.trim();
  return /^\d{1,5}$/.test(trimmed) ? Number(trimmed) : null;
}

function daysText(value: number | null): string {
  return value === null ? "" : String(value);
}

type Props = {
  draft: Draft;
  onDraft: (patch: Partial<Draft>) => void;
  onSide: (side: OutstandingSide) => void;
  options: OptionsPayload | null;
  fallbackBranches: FallbackBranches;
  party: PartyPicker;
  /** Opened by Ctrl+F: the Ledger list opens at once, and a pick applies. */
  findLedger: boolean;
  flagged: ErrorField;
  /** The client's own check, when Apply was refused. */
  error: string | null;
  onApply: () => void;
  onReset: () => void;
  onCancel: () => void;
};

export function MoreFiltersDialog({
  draft,
  onDraft,
  onSide,
  options,
  fallbackBranches,
  party,
  findLedger,
  flagged,
  error,
  onApply,
  onReset,
  onCancel,
}: Props) {
  const receivable = draft.side === "RECEIVABLE";
  const { groupChoices, areaOptions, partyOptions, partyEmpty, partyTip, branchOptions } = useFilterChoices(
    draft,
    options,
    fallbackBranches,
    party,
  );
  const dialogRef = useRef<HTMLDivElement | null>(null);
  // Due days as typed: a half-typed box must not snap back.
  const [minText, setMinText] = useState(daysText(draft.minDueDays));
  const [maxText, setMaxText] = useState(daysText(draft.maxDueDays));

  /*
   * Apply waits one task: an Enter in As on (or a box blurred just below)
   * settles its text into the draft first, and the screen's Apply must see
   * the draft of THAT render, not this one.
   */
  const applyRef = useRef(onApply);
  useEffect(() => {
    applyRef.current = onApply;
  });
  const settleThenApply = useCallback(() => {
    const active = document.activeElement;
    if (active instanceof HTMLInputElement && active.type === "text" && dialogRef.current?.contains(active)) {
      active.blur();
      active.focus();
    }
    window.setTimeout(() => applyRef.current(), 0);
  }, []);

  /*
   * Ctrl+F: open the Ledger list once the panel is really in the page. A ref
   * callback, not an effect: ModalPortal mounts its content a commit late.
   */
  const openedLedger = useRef(false);
  const openLedgerOnMount = useCallback(
    (node: HTMLDivElement | null) => {
      if (!node || !findLedger || openedLedger.current) return;
      openedLedger.current = true;
      const trigger = node.querySelector<HTMLButtonElement>('[role="combobox"]');
      trigger?.focus();
      trigger?.click();
    },
    [findLedger],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "F5") {
        event.preventDefault();
        event.stopPropagation();
        settleThenApply();
        return;
      }
      if (event.key !== "Escape" || event.defaultPrevented) return;
      // An open combo's list takes its own Escape (it is portaled out of the panel).
      if (dialogRef.current?.querySelector('[role="combobox"][aria-expanded="true"]')) return;
      event.preventDefault();
      event.stopPropagation();
      onCancel();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onCancel, settleThenApply]);

  const reset = () => {
    setMinText("");
    setMaxText("");
    onReset();
  };

  return (
    <ModalPortal>
      <div className={styles.overlay} style={{ zIndex: Z_MODAL }}>
        <button type="button" className={styles.backdrop} aria-label="Cancel" tabIndex={-1} onMouseDown={onCancel} />
        <div
          ref={dialogRef}
          className={cx(styles.dialog, styles.dialogWide)}
          role="dialog"
          aria-modal="true"
          aria-label="More filters"
          onKeyDown={(event) => {
            // A combo's own Enter (its list, portaled but still a React child) is already taken.
            if (event.key !== "Enter" || event.defaultPrevented) return;
            if ((event.target as HTMLElement).tagName === "BUTTON") return;
            event.preventDefault();
            settleThenApply();
          }}
        >
          <div className={styles.dialogHead}>
            More filters<span className={styles.dialogHeadNote}>every filter of the report · Apply shows it</span>
          </div>
          <div className={styles.filterDialogBody}>
            <section className={styles.filterSection} aria-label="Report">
              <div className={styles.filterSectionHead}>Report</div>

              <label className={styles.fieldLabel} htmlFor="po-more-side">
                Side <span className={styles.required}>*</span>
              </label>
              <select
                id="po-more-side"
                autoFocus={!findLedger}
                className={styles.select}
                value={draft.side}
                onChange={(event) => onSide(event.target.value as OutstandingSide)}
              >
                <option value="RECEIVABLE">Receivable</option>
                <option value="PAYABLE">Payable</option>
              </select>

              <label className={styles.fieldLabel} htmlFor="po-more-ason" title={AS_ON_TIP}>
                As on
              </label>
              <span className={cx(styles.filterCell, flagged === "asOn" && styles.fieldFlagged)} title={AS_ON_TIP}>
                <DateInput
                  id="po-more-ason"
                  className={cx(styles.input, styles.inputDate)}
                  value={draft.asOn}
                  onChange={(value) => onDraft({ asOn: value })}
                />
              </span>

              <label className={styles.fieldLabel} htmlFor="po-more-branch">
                Branch
              </label>
              <span className={cx(styles.filterCell, flagged === "branch" && styles.fieldFlagged)}>
                <select
                  id="po-more-branch"
                  className={styles.select}
                  value={draft.branchId ?? ALL_BRANCHES}
                  onChange={(event) =>
                    onDraft({ branchId: event.target.value === ALL_BRANCHES ? null : event.target.value })
                  }
                >
                  <option value={ALL_BRANCHES}>All branches (combined)</option>
                  {branchOptions.map((branch) => (
                    <option key={branch.value} value={branch.value}>
                      {branch.label}
                    </option>
                  ))}
                </select>
              </span>

              <label className={styles.fieldLabel} htmlFor="po-more-ageby">
                Age by
              </label>
              <select
                id="po-more-ageby"
                className={styles.select}
                value={draft.ageBy}
                onChange={(event) => onDraft({ ageBy: event.target.value === "DUE_DATE" ? "DUE_DATE" : "BILL_DATE" })}
              >
                <option value="BILL_DATE">Bill date</option>
                <option value="DUE_DATE">Due date</option>
              </select>

              <label className={styles.fieldLabel} htmlFor="po-more-buckets" title={BUCKETS_TIP}>
                Buckets
              </label>
              <span className={cx(styles.filterCell, flagged === "buckets" && styles.fieldFlagged)} title={BUCKETS_TIP}>
                <input
                  id="po-more-buckets"
                  className={cx(styles.input, styles.inputBuckets)}
                  value={draft.bucketsText}
                  onChange={(event) => onDraft({ bucketsText: event.target.value })}
                  data-uppercase="off"
                  inputMode="numeric"
                />
              </span>

              <span className={styles.fieldLabel}>Due days</span>
              <span className={cx(styles.filterCell, flagged === "dueDays" && styles.fieldFlagged)}>
                ≥
                <input
                  aria-label="Due days at least"
                  className={cx(styles.input, styles.inputDays)}
                  value={minText}
                  inputMode="numeric"
                  data-uppercase="off"
                  onChange={(event) => {
                    setMinText(event.target.value);
                    onDraft({ minDueDays: days(event.target.value) });
                  }}
                />
                ≤
                <input
                  aria-label="Due days at most"
                  className={cx(styles.input, styles.inputDays)}
                  value={maxText}
                  inputMode="numeric"
                  data-uppercase="off"
                  onChange={(event) => {
                    setMaxText(event.target.value);
                    onDraft({ maxDueDays: days(event.target.value) });
                  }}
                />
              </span>
              <span className={styles.dialogNote}>Due days: days overdue of an owed bill, as in 3.0.</span>
            </section>

            <section className={styles.filterSection} aria-label="Parties">
              <div className={styles.filterSectionHead}>Parties</div>

              {/* Spans, not labels: a label would re-route clicks to the combo's button. */}
              <span className={styles.fieldLabel}>Group</span>
              <div className={styles.dialogCombo}>
                <SearchableSelect
                  value={draft.groupId ?? DEFAULT_GROUP}
                  options={groupChoices}
                  onChange={(value) => onDraft({ groupId: value || null })}
                  searchPlaceholder="Find a group"
                />
              </div>

              {receivable ? (
                <>
                  <span className={styles.fieldLabel}>Area</span>
                  <div className={styles.dialogCombo}>
                    <SearchableSelect
                      value={draft.areaId ?? ""}
                      options={areaOptions}
                      onChange={(value) => onDraft({ areaId: value || null })}
                      searchPlaceholder="Find an area"
                    />
                  </div>
                </>
              ) : null}

              <span className={styles.fieldLabel} title={partyTip}>
                Ledger name
              </span>
              {/* Capture: the list is asked for on the first open, before the combo sees the click. */}
              <div
                ref={openLedgerOnMount}
                className={cx(styles.dialogCombo, flagged === "party" && styles.fieldFlagged)}
                title={partyTip}
                onMouseDownCapture={party.request}
                onFocusCapture={party.request}
              >
                <SearchableSelect
                  value={draft.partyId ?? ALL_PARTIES}
                  options={partyOptions}
                  onChange={(value) => {
                    onDraft({ partyId: value || null });
                    if (findLedger) settleThenApply();
                  }}
                  searchPlaceholder="Find a ledger"
                  emptyText={partyEmpty}
                />
              </div>

              {receivable ? (
                <>
                  <label className={styles.fieldLabel} htmlFor="po-more-salesman">
                    Salesman
                  </label>
                  <select
                    id="po-more-salesman"
                    className={styles.select}
                    value={draft.salesmanId ?? ""}
                    onChange={(event) => onDraft({ salesmanId: event.target.value || null })}
                  >
                    <option value="">All salesmen</option>
                    {(options?.salesmen ?? []).map((s) => (
                      <option key={s.salesmanId} value={s.salesmanId}>
                        {s.name}
                      </option>
                    ))}
                  </select>

                  <label className={styles.fieldLabel} htmlFor="po-more-day">
                    Collection day
                  </label>
                  <select
                    id="po-more-day"
                    className={styles.select}
                    value={draft.collectionDay ?? ""}
                    onChange={(event) =>
                      onDraft({ collectionDay: (event.target.value || null) as CollectionDay | null })
                    }
                  >
                    <option value="">Any day</option>
                    {COLLECTION_DAYS.map((day) => (
                      <option key={day} value={day}>
                        {dayName(day)}
                      </option>
                    ))}
                  </select>
                  <span className={styles.dialogNote}>
                    Salesman is the customer&apos;s default salesman: bills carry none yet, so customers without one
                    never match.
                  </span>
                </>
              ) : (
                <span className={styles.dialogNote}>
                  Area, Salesman and Collection day are for the Receivable side only.
                </span>
              )}
            </section>

            <section className={cx(styles.filterSection, styles.filterSectionFull)} aria-label="Include">
              <div className={styles.filterSectionHead}>Include</div>
              <div className={styles.filterSwitches}>
                {SWITCHES.map((item) => (
                  <label key={item.key} className={styles.check} title={item.tip}>
                    <input
                      type="checkbox"
                      checked={draft[item.key]}
                      onChange={(event) => onDraft({ [item.key]: event.target.checked })}
                    />
                    {item.label}
                  </label>
                ))}
              </div>
            </section>

            {error ? (
              <div className={styles.dialogError} role="alert">
                {error}
              </div>
            ) : null}
          </div>
          <div className={styles.dialogFoot}>
            <button type="button" className={cx(styles.button, styles.dialogFootLeft)} onClick={reset}>
              Reset
            </button>
            <button type="button" className={styles.button} onClick={onCancel}>
              Cancel<span className={styles.key}>Esc</span>
            </button>
            <button type="button" className={styles.primaryButton} onClick={onApply}>
              Apply<span className={styles.key}>F5</span>
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
