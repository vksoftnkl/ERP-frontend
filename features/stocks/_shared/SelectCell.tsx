"use client";

import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";

type SelectCellStyles = Record<string, string>;

export type SelectCellOption = {
  value: string;
  label: string;
};

type SelectCellProps = {
  rowId: number;
  fieldKey: string;
  value: string;
  options: readonly SelectCellOption[];
  styles: SelectCellStyles;
  // Optional leading <option> rendered before the data options (e.g. an empty
  // "Select item first" prompt or a "Select Round Off" placeholder).
  placeholderOption?: SelectCellOption | null;
  disabled?: boolean;
  hasError?: boolean;
  // Hides the native select arrow for selects that read as static (tracking/cess type).
  hideNativeArrow?: boolean;
  // Prefix for stable option keys when option values may repeat across rows.
  optionKeyPrefix?: string;
  onChange: (value: string) => void;
  onKeyDown?: (event: ReactKeyboardEvent<HTMLSelectElement>) => void;
};

function cx(...tokens: Array<string | false | undefined>): string {
  return tokens.filter(Boolean).join(" ");
}

/**
 * Presentational dropdown cell shared by the stock entry tables. Renders a native
 * `<select>` styled like the rest of the grid while keeping every business rule
 * (which options, labels, disabled/placeholder logic) in the caller.
 */
export function SelectCell({
  rowId,
  fieldKey,
  value,
  options,
  styles,
  placeholderOption,
  disabled = false,
  hasError = false,
  hideNativeArrow = false,
  optionKeyPrefix,
  onChange,
  onKeyDown,
}: SelectCellProps): ReactNode {
  return (
    <select
      data-opening-stock-field-control="true"
      data-opening-stock-row-id={rowId}
      data-opening-stock-field-key={fieldKey}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={onKeyDown}
      className={cx(
        styles.cellSelect,
        hideNativeArrow && styles.cellSelectNoArrow,
        hasError && styles.requiredField,
      )}
      disabled={disabled}
      aria-invalid={hasError || undefined}
    >
      {placeholderOption ? (
        <option value={placeholderOption.value}>{placeholderOption.label}</option>
      ) : null}
      {options.map((option) => (
        <option
          key={optionKeyPrefix ? `${optionKeyPrefix}-${option.value}` : option.value}
          value={option.value}
        >
          {option.label}
        </option>
      ))}
    </select>
  );
}
