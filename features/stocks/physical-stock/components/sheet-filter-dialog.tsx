"use client";

/**
 * Load Sheet's filter — Qt `PhysicalSheetFilterDialog`. A shop counts a big
 * godown a part at a time, so F9 asks what to draw: item group, brand,
 * category, section (all server-filtered, notes 157), bucket, whether empty
 * holdings come too, and "only negative stock". Enter loads; Esc backs out.
 */
import { useEffect, useMemo, useState } from "react";
import { cx } from "@/components/design-system/cx";
import { useDropdownId, type ConfiguredDropdownKey } from "@/lib/configured-dropdowns";
import { CheckField, DropdownCombo } from "@/features/sales/quotation/components/fields";
import { ModalShell } from "@/features/sales/quotation/components/modal-shell";
import quotationStyles from "@/features/sales/quotation/page.module.scss";
import { STOCK_BUCKETS } from "../physical-stock.constants";
import type { SheetFilter } from "../physical-stock.sheet-filter";
import styles from "../page.module.scss";

type Picker = {
  key: ConfiguredDropdownKey;
  label: string;
  valueKey: string;
  labelKey: string;
  id: "group" | "brand" | "category" | "section";
};

const PICKERS: readonly Picker[] = [
  { id: "group", key: "itemGroup", label: "Item Group", valueKey: "itg_id", labelKey: "itg_name" },
  { id: "brand", key: "itemBrand", label: "Brand", valueKey: "brand_id", labelKey: "brand_name" },
  { id: "category", key: "itemCategory", label: "Category", valueKey: "category_id", labelKey: "category_name" },
  { id: "section", key: "itemSection", label: "Section", valueKey: "sec_id", labelKey: "sec_name" },
];

export type SheetFilterDialogProps = {
  isOpen: boolean;
  godownName: string;
  current: SheetFilter;
  onCancel: () => void;
  onLoad: (filter: SheetFilter) => void;
};

/** Mounted only while open, so every open starts from the last answer. */
export function SheetFilterDialog(props: SheetFilterDialogProps) {
  return props.isOpen ? <OpenSheetFilter {...props} /> : null;
}

function OpenSheetFilter({ isOpen, godownName, current, onCancel, onLoad }: SheetFilterDialogProps) {
  const [filter, setFilter] = useState<SheetFilter>(current);
  const groupId = useDropdownId("itemGroup");
  const brandId = useDropdownId("itemBrand");
  const categoryId = useDropdownId("itemCategory");
  const sectionId = useDropdownId("itemSection");
  const dropdownIds = useMemo(
    () => ({ group: groupId, brand: brandId, category: categoryId, section: sectionId }),
    [groupId, brandId, categoryId, sectionId],
  );

  // Enter loads from anywhere that is not an open option list or a button.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Enter" || event.defaultPrevented) {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target?.closest("button, [role='listbox'], [role='combobox'], input[role='combobox']")) {
        return;
      }
      event.preventDefault();
      onLoad(filter);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [filter, onLoad]);

  const set = (patch: Partial<SheetFilter>) => setFilter((prev) => ({ ...prev, ...patch }));
  const valueOf = (picker: Picker) => ({
    id: filter[`${picker.id}Id` as const],
    name: filter[`${picker.id}Name` as const],
  });

  return (
    <ModalShell
      title={`Load count sheet — ${godownName}`}
      isOpen={isOpen}
      narrow
      onClose={onCancel}
      footer={
        <>
          <button type="button" className={quotationStyles.button} onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className={cx(quotationStyles.button, quotationStyles.buttonPrimary)}
            onClick={() => onLoad(filter)}
          >
            Load
          </button>
        </>
      }
    >
      <p className={cx(quotationStyles.modalNote, styles.askMessage)}>
        Draws this godown&apos;s holdings onto the sheet. Lines already on it stay, with what was
        counted — load one group after another.
      </p>
      <div className={styles.sheetFilterForm}>
        {PICKERS.map((picker) => {
          const value = valueOf(picker);
          return (
            <div key={picker.id} className={styles.sheetFilterRow}>
              <span className={styles.sheetFilterLabel}>{picker.label}</span>
              <div className={styles.sheetFilterControl}>
                <DropdownCombo
                  id={`physical-stock-sheet-${picker.id}`}
                  label={picker.label}
                  dropdownId={dropdownIds[picker.id]}
                  valueKey={picker.valueKey}
                  labelKey={picker.labelKey}
                  value={value.id}
                  selectedLabel={value.name}
                  placeholder="All"
                  onSelect={(id, name) => set({ [`${picker.id}Id`]: id, [`${picker.id}Name`]: name })}
                />
              </div>
              {value.id ? (
                <button
                  type="button"
                  className={styles.sheetFilterClear}
                  title={`Back to every ${picker.label.toLowerCase()}`}
                  onClick={() => set({ [`${picker.id}Id`]: "", [`${picker.id}Name`]: "" })}
                >
                  All
                </button>
              ) : null}
            </div>
          );
        })}
        <div className={styles.sheetFilterRow}>
          <label className={styles.sheetFilterLabel} htmlFor="physical-stock-sheet-bucket">
            Bucket
          </label>
          <select
            id="physical-stock-sheet-bucket"
            className={cx(quotationStyles.select, styles.sheetFilterControl)}
            value={filter.bucket}
            onChange={(event) => set({ bucket: event.target.value })}
          >
            <option value="">All</option>
            {STOCK_BUCKETS.map((bucket) => (
              <option key={bucket} value={bucket}>
                {bucket}
              </option>
            ))}
          </select>
        </div>
      </div>
      <CheckField
        id="physical-stock-sheet-zero"
        label="Include holdings with no stock (the book says empty — a count may still find some)"
        checked={filter.includeZero && !filter.negativeOnly}
        disabled={filter.negativeOnly}
        onChange={(includeZero) => set({ includeZero })}
      />
      <CheckField
        id="physical-stock-sheet-negative"
        label="Only negative stock (the book is below zero)"
        checked={filter.negativeOnly}
        onChange={(negativeOnly) => set({ negativeOnly })}
      />
    </ModalShell>
  );
}
