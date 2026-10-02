"use client";

/**
 * F8 — "Filter items" (Qt `SellingPriceFilterDialog`).
 *
 * Which items Load brings, by the item entry's basic information. Every field
 * is optional; Active items only is on by default. Apply & Load hands the
 * filter back and the screen loads it; Cancel changes nothing. The picked
 * names come back in with their ids, so reopening shows what is in force.
 */
import { useState } from "react";
import { DropdownCombo } from "@/features/sales/quotation/components/fields";
import { ModalShell } from "@/features/sales/quotation/components/modal-shell";
import qs from "@/features/sales/quotation/page.module.scss";
import { useDropdownId } from "@/lib/configured-dropdowns";
import { FILTER_FIELDS, type FilterFieldKey, type FilterFieldSpec } from "../selling-price.constants";
import {
  filterStateFrom,
  picksOf,
  type FilterPick,
  type FilterState,
} from "../selling-price.filter";
import { enterMovesToNextField } from "./enter-navigation";
import styles from "../page.module.scss";

type Picks = Partial<Record<FilterFieldKey, FilterPick>>;

function FilterDropdown({
  spec,
  pick,
  onPick,
}: {
  spec: FilterFieldSpec;
  pick: FilterPick | undefined;
  onPick: (pick: FilterPick | undefined) => void;
}) {
  const dropdownId = useDropdownId(spec.dropdownKey);
  return (
    <div className={styles.filterCell}>
      <DropdownCombo
        id={`csp-filter-${spec.key}`}
        label={spec.caption}
        dropdownId={dropdownId}
        valueKey={spec.valueKey}
        labelKey={spec.labelKey}
        metaKey={spec.metaKey}
        value={pick?.id ?? ""}
        selectedLabel={pick?.text ?? ""}
        placeholder="All"
        onSelect={(value, label) => onPick(value ? { id: value, text: label } : undefined)}
      />
      <button
        type="button"
        className={styles.filterFieldClear}
        title={`${spec.caption}: All`}
        aria-label={`Clear ${spec.caption}`}
        tabIndex={-1}
        disabled={!pick}
        onClick={() => onPick(undefined)}
      >
        ×
      </button>
    </div>
  );
}

export type FilterDialogProps = {
  current: FilterState;
  onCancel: () => void;
  onApply: (state: FilterState) => void;
};

/** Mounted only while open: each opening starts from the filter in force. */
export function FilterDialog({ current, onCancel, onApply }: FilterDialogProps) {
  const [search, setSearch] = useState(current.filters.search);
  const [activeOnly, setActiveOnly] = useState(current.filters.activeOnly);
  const [picks, setPicks] = useState<Picks>(() => picksOf(current));

  const clearAll = () => {
    setSearch("");
    setPicks({});
    setActiveOnly(true);
    document.getElementById("csp-filter-search")?.focus();
  };

  const apply = () => onApply(filterStateFrom(search, activeOnly, picks));

  return (
    <ModalShell
      title="Filter items"
      isOpen
      onClose={onCancel}
      footer={
        <div className={styles.dialogButtons}>
          <button type="button" className={qs.button} onClick={clearAll}>
            Clear all
          </button>
          <span className={styles.dialogButtonsSpacer} />
          <button type="button" className={qs.button} onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className={`${qs.button} ${qs.buttonPrimary}`} onClick={apply}>
            Apply &amp; Load
          </button>
        </div>
      }
    >
      <div onKeyDown={enterMovesToNextField} style={{ display: "contents" }}>
        <p className={styles.dlgMuted}>
          Which items Load brings. Every field is optional — leave a field empty to take all of it.
        </p>

        <p className={styles.dlgSection}>Find</p>
        <div className={styles.searchBox}>
          <input
            id="csp-filter-search"
            className={qs.input}
            value={search}
            autoFocus
            onFocus={(event) => event.currentTarget.select()}
            placeholder="Item code, name or barcode contains…"
            autoComplete="off"
            maxLength={100}
            onChange={(event) => setSearch(event.target.value)}
          />
          <button
            type="button"
            className={styles.filterFieldClear}
            aria-label="Clear the search"
            tabIndex={-1}
            disabled={!search}
            onClick={() => setSearch("")}
          >
            ×
          </button>
        </div>

        <hr className={styles.dlgRule} />

        <p className={styles.dlgSection}>Item basics</p>
        <div className={styles.filterGrid}>
          {FILTER_FIELDS.map((spec) => (
            <FilterDropdown
              key={spec.key}
              spec={spec}
              pick={picks[spec.key]}
              onPick={(pick) =>
                setPicks((previous) => {
                  const next = { ...previous };
                  if (pick) {
                    next[spec.key] = pick;
                  } else {
                    delete next[spec.key];
                  }
                  return next;
                })
              }
            />
          ))}
        </div>

        <hr className={styles.dlgRule} />

        <p className={styles.dlgSection}>Status</p>
        <label className={styles.checkLine}>
          <input
            id="csp-filter-active"
            type="checkbox"
            checked={activeOnly}
            onChange={(event) => setActiveOnly(event.target.checked)}
          />
          Active items only
        </label>
      </div>
    </ModalShell>
  );
}
