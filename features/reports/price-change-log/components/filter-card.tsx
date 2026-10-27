"use client";

/**
 * The filter bar — Qt price_change_log_entry.ui `frameFilters` after 091bf5b:
 *
 *   From [date] ◀ ▶  To [date]   Search [text]  [Filters (n)…]  [Show]
 *   Showing: branch … · item … (the summary line)
 *
 * The bar keeps what is changed most — the dates (◀ ▶ a day at a time) and the
 * search. Branch, Item, Show, Screen, Change and User live in the Filters popup
 * (F4); each filter still runs the report the moment it is set, popup open or
 * not. Search runs on Enter / Show.
 */
import { useMemo, useState, type RefObject } from "react";
import { cx } from "@/components/design-system/cx";
import { ModalShell } from "@/features/sales/quotation/components/modal-shell";
import { DropdownCombo } from "@/features/sales/quotation/components/fields";
import { useDropdownId, type ConfiguredDropdownKey } from "@/lib/configured-dropdowns";
import styles from "../page.module.scss";
import {
  PRICE_CHANGE_ACTIONS,
  PRICE_CHANGE_SOURCES,
  type PriceChangeAction,
  type PriceChangeSource,
  type PriceTableFilter,
} from "../wire/types";
import { actionLabel, sourceLabel } from "../view/words";

export type FilterPick = { id: string; text: string } | null;

export type ScreenFilters = {
  from: string;
  to: string;
  branch: FilterPick;
  item: FilterPick;
  user: FilterPick;
  table: PriceTableFilter;
  source: PriceChangeSource | "";
  action: PriceChangeAction | "";
};

export const TABLE_CHOICES: ReadonlyArray<{ value: PriceTableFilter; label: string }> = [
  { value: "BOTH", label: "Prices and qty slabs" },
  { value: "IPM", label: "Prices only" },
  { value: "IQP", label: "Qty slabs only" },
];

export const SOURCE_CHOICES: ReadonlyArray<{ value: PriceChangeSource | ""; label: string }> = [
  { value: "", label: "Any screen" },
  ...PRICE_CHANGE_SOURCES.map((value) => ({ value, label: sourceLabel(value) })),
];

/** Qt lists them UPDATE first: a change is what people look for. */
const ACTION_ORDER: readonly PriceChangeAction[] = ["UPDATE", "CREATE", "DELETE", "RESTORE", "REKEY"];
export const ACTION_CHOICES: ReadonlyArray<{ value: PriceChangeAction | ""; label: string }> = [
  { value: "", label: "Any change" },
  ...ACTION_ORDER.filter((a) => PRICE_CHANGE_ACTIONS.includes(a)).map((value) => ({ value, label: actionLabel(value) })),
];

/** A date typed digit by digit passes through years 0002, 0020, 0202: only a plausible one is applied. */
function plausibleDay(value: string): boolean {
  const match = /^(\d{4})-\d{2}-\d{2}$/.exec(value);
  return Boolean(match) && Number(match?.[1]) >= 1990 && Number(match?.[1]) <= 2200;
}

function DateBox({
  id,
  value,
  label,
  onCommit,
}: {
  id: string;
  value: string;
  label: string;
  onCommit: (value: string) => void;
}) {
  // The box's own text while it is being keyed; the applied value otherwise.
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      id={id}
      type="date"
      className={styles.input}
      aria-label={label}
      value={draft ?? value}
      onChange={(event) => {
        const next = event.target.value;
        if (plausibleDay(next)) {
          setDraft(null);
          if (next !== value) onCommit(next);
        } else {
          setDraft(next);
        }
      }}
      onBlur={() => setDraft(null)}
    />
  );
}

function PickBox({
  id,
  label,
  dropdownKey,
  valueKey,
  labelKey,
  placeholder,
  pick,
  params,
  onPick,
}: {
  id: string;
  label: string;
  dropdownKey: ConfiguredDropdownKey;
  valueKey: string;
  labelKey: string;
  placeholder: string;
  pick: FilterPick;
  params?: Record<string, string>;
  onPick: (pick: FilterPick) => void;
}) {
  const dropdownId = useDropdownId(dropdownKey);
  return (
    <div className={styles.comboCell}>
      <DropdownCombo
        id={id}
        label={label}
        dropdownId={dropdownId}
        valueKey={valueKey}
        labelKey={labelKey}
        value={pick?.id ?? ""}
        selectedLabel={pick?.text ?? ""}
        placeholder={placeholder}
        params={params}
        onSelect={(value, text) => onPick(value ? { id: value, text } : null)}
      />
      {pick ? (
        <button
          type="button"
          className={styles.comboClear}
          title={`${label}: ${placeholder}`}
          aria-label={`Clear ${label}`}
          tabIndex={-1}
          onClick={() => onPick(null)}
        >
          ×
        </button>
      ) : null}
    </div>
  );
}

/** What is narrowed — Qt `refreshFilterSummary()`. The words are the print heading's. */
export function activeFilterParts(filters: ScreenFilters): string[] {
  const parts: string[] = [];
  if (filters.branch) parts.push(`branch ${filters.branch.text}`);
  if (filters.item) parts.push(`item ${filters.item.text}`);
  if (filters.table !== "BOTH") {
    parts.push((TABLE_CHOICES.find((c) => c.value === filters.table)?.label ?? filters.table).toLowerCase());
  }
  if (filters.source) {
    parts.push(`from ${SOURCE_CHOICES.find((c) => c.value === filters.source)?.label ?? filters.source}`);
  }
  if (filters.action) {
    parts.push((ACTION_CHOICES.find((c) => c.value === filters.action)?.label ?? filters.action).toLowerCase());
  }
  if (filters.user) parts.push(`by ${filters.user.text}`);
  return parts;
}

export const FILTER_SUMMARY_EMPTY = "Every branch, item, screen and user — F4 to narrow it down";

export function filterSummaryLine(parts: readonly string[]): string {
  return parts.length === 0 ? FILTER_SUMMARY_EMPTY : `Showing: ${parts.join(" · ")}`;
}

export function filtersButtonText(count: number): string {
  return count === 0 ? "Filters…" : `Filters (${count})…`;
}

export type FilterBarProps = {
  filters: ScreenFilters;
  onChange: (patch: Partial<ScreenFilters>) => void;
  onStep: (delta: -1 | 1) => void;
  search: string;
  onSearch: (text: string) => void;
  onShow: () => void;
  onOpenFilters: () => void;
  searchRef: RefObject<HTMLInputElement | null>;
};

export function FilterBar({
  filters,
  onChange,
  onStep,
  search,
  onSearch,
  onShow,
  onOpenFilters,
  searchRef,
}: FilterBarProps) {
  const parts = activeFilterParts(filters);
  return (
    <div className={styles.filterBarWrap}>
      <div className={styles.card} role="group" aria-label="Dates and search">
        <label className={styles.fieldLabel} htmlFor="pcl-from">
          From
        </label>
        <DateBox id="pcl-from" label="From" value={filters.from} onCommit={(from) => onChange({ from })} />
        <button type="button" className={styles.stepButton} title="One day earlier" tabIndex={-1} onClick={() => onStep(-1)}>
          ◀
        </button>
        <button type="button" className={styles.stepButton} title="One day later" tabIndex={-1} onClick={() => onStep(1)}>
          ▶
        </button>
        <div className={styles.toGroup}>
          <label className={styles.fieldLabel} htmlFor="pcl-to">
            To
          </label>
          <DateBox id="pcl-to" label="To" value={filters.to} onCommit={(to) => onChange({ to })} />
        </div>
        <label className={styles.fieldLabel} htmlFor="pcl-search">
          Search
        </label>
        <input
          id="pcl-search"
          ref={searchRef}
          type="search"
          className={styles.input}
          placeholder="item code or name"
          autoComplete="off"
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey) {
              event.preventDefault();
              onShow();
            }
          }}
        />
        <button
          type="button"
          id="pcl-filters-button"
          className={cx(styles.button, parts.length > 0 && styles.buttonActive)}
          tabIndex={-1}
          title="Branch, item, prices or slabs, screen, change and user (F4)"
          onClick={onOpenFilters}
        >
          {filtersButtonText(parts.length)}
        </button>
        <button type="button" className={styles.primaryButton} tabIndex={-1} onClick={onShow}>
          Show
        </button>
      </div>
      <div className={styles.filterSummary} data-testid="pcl-filter-summary">
        {filterSummaryLine(parts)}
      </div>
    </div>
  );
}

export type FiltersDialogProps = {
  isOpen: boolean;
  companyId: string;
  filters: ScreenFilters;
  onChange: (patch: Partial<ScreenFilters>) => void;
  /** Branch, item, user, show, screen and change all back to "any" — Qt btnClearFilters. */
  onClear: () => void;
  onClose: () => void;
};

/** Qt `priceLogFilterDialog` — the six filters moved off the bar. */
export function FiltersDialog({ isOpen, companyId, filters, onChange, onClear, onClose }: FiltersDialogProps) {
  const branchParams = useMemo(() => ({ ibr_comp_id: companyId }), [companyId]);
  const userParams = useMemo(() => ({ icompany_id: companyId }), [companyId]);
  return (
    <ModalShell
      title="Price change log — filters"
      isOpen={isOpen}
      narrow
      onClose={onClose}
      footer={
        <>
          <button type="button" className={styles.button} onClick={onClear}>
            Clear filters
          </button>
          <span className={styles.footerSpacer} />
          <button type="button" className={styles.primaryButton} onClick={onClose}>
            Done
          </button>
        </>
      }
    >
      <div className={styles.filterForm}>
        <label className={styles.fieldLabel} htmlFor="pcl-branch">
          Branch
        </label>
        <PickBox
          id="pcl-branch"
          label="Branch"
          dropdownKey="branchByCompany"
          valueKey="br_id"
          labelKey="br_name"
          placeholder="Every branch"
          pick={filters.branch}
          params={branchParams}
          onPick={(branch) => onChange({ branch })}
        />
        <label className={styles.fieldLabel} htmlFor="pcl-item">
          Item
        </label>
        <PickBox
          id="pcl-item"
          label="Item"
          dropdownKey="item"
          valueKey="item_id"
          labelKey="item_name_en"
          placeholder="any item"
          pick={filters.item}
          onPick={(item) => onChange({ item })}
        />
        <label className={styles.fieldLabel} htmlFor="pcl-table">
          Show
        </label>
        <select
          id="pcl-table"
          className={styles.select}
          value={filters.table}
          onChange={(event) => onChange({ table: event.target.value as PriceTableFilter })}
        >
          {TABLE_CHOICES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        <label className={styles.fieldLabel} htmlFor="pcl-source">
          Screen
        </label>
        <select
          id="pcl-source"
          className={styles.select}
          value={filters.source}
          onChange={(event) => onChange({ source: event.target.value as PriceChangeSource | "" })}
        >
          {SOURCE_CHOICES.map((c) => (
            <option key={c.value || "any"} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        <label className={styles.fieldLabel} htmlFor="pcl-action">
          Change
        </label>
        <select
          id="pcl-action"
          className={styles.select}
          value={filters.action}
          onChange={(event) => onChange({ action: event.target.value as PriceChangeAction | "" })}
        >
          {ACTION_CHOICES.map((c) => (
            <option key={c.value || "any"} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        <label className={styles.fieldLabel} htmlFor="pcl-user">
          User
        </label>
        <PickBox
          id="pcl-user"
          label="User"
          dropdownKey="tillApproverUser"
          valueKey="usr_id"
          labelKey="usr_name"
          placeholder="anyone"
          pick={filters.user}
          params={userParams}
          onPick={(user) => onChange({ user })}
        />
      </div>
    </ModalShell>
  );
}
