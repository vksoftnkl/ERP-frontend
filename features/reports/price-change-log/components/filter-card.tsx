"use client";

/**
 * The filter card — Qt price_change_log_entry.ui `frameFilters`, two rows:
 *
 *   From [date] ◀ ▶  To [date]   Branch [dd 61]   Item [dd 42]
 *   Show [table] [source] [action] User [dd 68]   Search [text]  [Show]
 *
 * Every filter runs the report as soon as it is set; Search on Enter / Show.
 */
import { useMemo, useState, type RefObject } from "react";
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

export type FilterCardProps = {
  companyId: string;
  filters: ScreenFilters;
  onChange: (patch: Partial<ScreenFilters>) => void;
  onStep: (delta: -1 | 1) => void;
  search: string;
  onSearch: (text: string) => void;
  onShow: () => void;
  searchRef: RefObject<HTMLInputElement | null>;
};

export function FilterCard({ companyId, filters, onChange, onStep, search, onSearch, onShow, searchRef }: FilterCardProps) {
  const branchParams = useMemo(() => ({ ibr_comp_id: companyId }), [companyId]);
  const userParams = useMemo(() => ({ icompany_id: companyId }), [companyId]);

  return (
    <div className={styles.card} role="group" aria-label="Filters">
      {/* row 1 */}
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
      <div className={styles.itemCell}>
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
      </div>

      {/* row 2 */}
      <label className={styles.fieldLabel} htmlFor="pcl-table">
        Show
      </label>
      <div className={styles.combos}>
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
        <select
          className={styles.select}
          aria-label="Source"
          value={filters.source}
          onChange={(event) => onChange({ source: event.target.value as PriceChangeSource | "" })}
        >
          {SOURCE_CHOICES.map((c) => (
            <option key={c.value || "any"} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        <select
          className={styles.select}
          aria-label="Action"
          value={filters.action}
          onChange={(event) => onChange({ action: event.target.value as PriceChangeAction | "" })}
        >
          {ACTION_CHOICES.map((c) => (
            <option key={c.value || "any"} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </div>
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
      <button type="button" className={styles.primaryButton} tabIndex={-1} onClick={onShow}>
        Show
      </button>
    </div>
  );
}
