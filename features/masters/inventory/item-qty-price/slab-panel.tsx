"use client";
import type { ReactNode } from "react";
import { NexDropdownSingle, type DropdownSelection } from "@/components/design-system/dropdown";
import { DateInput } from "@/components/design-system/ui/date-input";
import { useDropdownId, type ConfiguredDropdownKey } from "@/lib/configured-dropdowns";
import type { ItemQtyPriceRow, SlabPanelField } from "./item-qty-price.types";
import styles from "./item-qty-price.module.scss";

export type SlabScopeField = "company" | "branch" | "party" | "priceLevel";
export type SlabDateField = "effectiveFrom" | "effectiveTo";
export type SlabFlagField = "isActive" | "isTaxIncl";

/** The panel's controls by field, so a refusal or a validation can put the cursor there. */
export const SLAB_PANEL_FIELD_ID: Readonly<Record<SlabPanelField, string>> = {
  company: "iqp-panel-company",
  branch: "iqp-panel-branch",
  party: "iqp-panel-customer",
  priceLevel: "iqp-panel-price-level",
  effectiveFrom: "iqp-panel-from-date",
  effectiveTo: "iqp-panel-to-date",
};

type SlabPanelProps = {
  /** The current REAL slab; null on the blank line or with no item. */
  row: ItemQtyPriceRow | null;
  /** Its grid position, for the headings. */
  rowNumber: number | null;
  onScope: (field: SlabScopeField, id: string, name: string) => void;
  onDate: (field: SlabDateField, value: string) => void;
  onFlag: (field: SlabFlagField, checked: boolean) => void;
};

export function SectionHeading({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className={styles.sectionHeading}>
      <h2 className={styles.sectionTitle}>{children}</h2>
      <span className={styles.sectionRule} aria-hidden="true" />
      {aside ? <span className={styles.sectionAside}>{aside}</span> : null}
    </div>
  );
}

function ScopeDropdown({
  field,
  dropdownKey,
  label,
  placeholder,
  id,
  text,
  row,
  onScope,
}: {
  field: SlabScopeField;
  dropdownKey: ConfiguredDropdownKey;
  label: string;
  placeholder: string;
  id: string;
  text: string;
  row: ItemQtyPriceRow | null;
  onScope: SlabPanelProps["onScope"];
}) {
  const dropdownId = useDropdownId(dropdownKey);
  return (
    <>
      <label className={styles.fieldLabel} htmlFor={SLAB_PANEL_FIELD_ID[field]}>
        {label}
      </label>
      <NexDropdownSingle
        id={SLAB_PANEL_FIELD_ID[field]}
        dropdownId={dropdownId}
        value={row && id ? { id, text: text || id } : null}
        onChange={(picked: DropdownSelection | null) => onScope(field, picked?.id ?? "", picked?.text ?? "")}
        disabled={!row}
        placeholder={placeholder}
        aria-label={label}
        className={styles.dropdown}
      />
    </>
  );
}

// The slab under the cursor's "Applies to" and "When" (Qt setupPanel — the
// promotion page's layout, user 2026-10-22). Every control writes straight
// into that row, so the save reads the grid as before; a dropdown pick moves
// the focus on, as NexDropdownSingle does. On the blank line, before its unit
// is picked, the panel waits.
export function SlabPanel({ row, rowNumber, onScope, onDate, onFlag }: SlabPanelProps) {
  const slab = row && rowNumber ? ` — slab ${rowNumber}` : "";
  const dateInput = (field: SlabDateField, value: string) => (
    <DateInput
      block
      id={SLAB_PANEL_FIELD_ID[field]}
      className={styles.fieldInput}
      value={value}
      disabled={!row}
      onChange={(next) => onDate(field, next)}
    />
  );
  return (
    <div className={styles.panel}>
      <section className={styles.panelGroup}>
        <SectionHeading>{`Applies to${slab}`}</SectionHeading>
        <div className={styles.panelGrid}>
          <ScopeDropdown
            field="company"
            dropdownKey="company"
            label="Company"
            placeholder="All companies"
            id={row?.companyId ?? ""}
            text={row?.companyName ?? ""}
            row={row}
            onScope={onScope}
          />
          <ScopeDropdown
            field="branch"
            dropdownKey="branch"
            label="Branch"
            placeholder="All branches"
            id={row?.branchId ?? ""}
            text={row?.branchName ?? ""}
            row={row}
            onScope={onScope}
          />
          <ScopeDropdown
            field="party"
            dropdownKey="customer"
            label="Customer"
            placeholder="Any customer"
            id={row?.partyId ?? ""}
            text={row?.partyName ?? ""}
            row={row}
            onScope={onScope}
          />
          <ScopeDropdown
            field="priceLevel"
            dropdownKey="priceLevel"
            label="Price level"
            placeholder="Any price level"
            id={row?.priceLevel ?? ""}
            text={row?.priceLevelName ?? ""}
            row={row}
            onScope={onScope}
          />
        </div>
      </section>
      <section className={styles.panelGroup}>
        <SectionHeading>{`When${slab}`}</SectionHeading>
        <div className={styles.panelGrid}>
          <label className={styles.fieldLabel} htmlFor={SLAB_PANEL_FIELD_ID.effectiveFrom}>
            From
          </label>
          {dateInput("effectiveFrom", row?.effectiveFrom ?? "")}
          <label className={styles.fieldLabel} htmlFor={SLAB_PANEL_FIELD_ID.effectiveTo}>
            To
          </label>
          {dateInput("effectiveTo", row?.effectiveTo ?? "")}
          <span />
          <label className={styles.checkLabel}>
            <input
              type="checkbox"
              checked={row?.isActive ?? false}
              disabled={!row}
              onChange={(event) => onFlag("isActive", event.target.checked)}
            />
            Active
          </label>
          <span />
          <label className={styles.checkLabel}>
            <input
              type="checkbox"
              checked={row?.isTaxIncl ?? false}
              disabled={!row}
              onChange={(event) => onFlag("isTaxIncl", event.target.checked)}
            />
            Price includes tax
          </label>
        </div>
      </section>
    </div>
  );
}
