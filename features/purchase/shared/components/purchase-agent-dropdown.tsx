"use client";

/**
 * Agent — the PURCHASE AGENTS dropdown (Qt e782e59 `ddAgent`: dropdown 74, found
 * BY NAME at open; 74 is only the fallback). A server-searched combo over
 * purchase.pur_agent (active, not deleted, this company's or shared), so the
 * agent is typed and picked in the header like the supplier — it replaced the
 * grid-194 picker box on the PO. For the PO and Purchase Entry.
 *
 * Type to search; Backspace / Delete on the picked name clears it (Qt
 * NexDropdownSingle). `onSelect("", "")` = no agent. Renders a label + field
 * pair (the quotation `DropdownCombo`), laid straight into the screen's grid.
 */
import { useMemo, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { DropdownCombo } from "@/features/sales/quotation/components/fields";
import { useDropdownId } from "@/lib/configured-dropdowns";
import styles from "./purchase-parts.module.scss";

/** The SQL columns of PURCHASE AGENTS (pag_id = the agent's ledger, pag_name, pag_code). */
export const PURCHASE_AGENT_VALUE_KEY = "pag_id";
export const PURCHASE_AGENT_LABEL_KEY = "pag_name";
export const PURCHASE_AGENT_CODE_KEY = "pag_code";

export type PurchaseAgentDropdownProps = {
  id: string;
  /** Bound as the SQL's quoted `'icompany_id'` (always sent). */
  companyId: string;
  value: string;
  /** The picked agent's name (shown before the list is fetched). */
  selectedLabel: string;
  disabled?: boolean;
  label?: string;
  placeholder?: string;
  onSelect: (id: string, name: string) => void;
};

export function PurchaseAgentDropdown({
  id,
  companyId,
  value,
  selectedLabel,
  disabled,
  label = "Agent",
  placeholder = "the broker — type to search, Backspace clears",
  onSelect,
}: PurchaseAgentDropdownProps) {
  const dropdownId = useDropdownId("purchaseAgent");
  const params = useMemo(() => ({ icompany_id: companyId }), [companyId]);

  /** Backspace / Delete on the shown name (no search typed) = no agent. */
  const onKeyDownCapture = (event: ReactKeyboardEvent<HTMLSpanElement>) => {
    if (disabled || !value || (event.key !== "Backspace" && event.key !== "Delete")) {
      return;
    }
    if (event.ctrlKey || event.altKey || event.metaKey) {
      return;
    }
    const input = event.target;
    if (input instanceof HTMLInputElement && input.id === id && input.value === (selectedLabel ?? "")) {
      event.preventDefault();
      event.stopPropagation();
      onSelect("", "");
    }
  };

  return (
    <span className={styles.contents} onKeyDownCapture={onKeyDownCapture}>
      <DropdownCombo
        id={id}
        label={label}
        dropdownId={dropdownId}
        valueKey={PURCHASE_AGENT_VALUE_KEY}
        labelKey={PURCHASE_AGENT_LABEL_KEY}
        metaKey={PURCHASE_AGENT_CODE_KEY}
        value={value}
        selectedLabel={selectedLabel}
        disabled={disabled}
        params={params}
        placeholder={placeholder}
        onSelect={onSelect}
      />
    </span>
  );
}
