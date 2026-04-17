"use client";

import type { ReactNode, RefObject } from "react";
import { FiChevronDown, FiSearch } from "react-icons/fi";
import type { ERPDynamicSelectOption } from "@/components/library/ui";
import { LOOKUP_FIELD_CONFIG } from "./constants";
import type { LookupKind } from "./Types";
import { cx } from "./Utils";
import styles from "./page.module.scss";

type LookupCellProps = {
  cellKey: string;
  lookupKind: LookupKind;
  isOpen: boolean;
  isLoading: boolean;
  selectedId: string;
  selectedLabel: string;
  placeholder?: string;
  header: string;
  options: ERPDynamicSelectOption[];
  searchQuery: string;
  hasValidationError: boolean;
  searchInputRef: RefObject<HTMLInputElement | null>;
  rootRef: (element: HTMLDivElement | null) => void;
  onToggle: () => void;
  onSearchChange: (search: string) => void;
  onSelect: (option: ERPDynamicSelectOption) => void;
};

export function LookupCell({
  cellKey,
  lookupKind,
  isOpen,
  isLoading,
  selectedId,
  selectedLabel,
  placeholder,
  header,
  options,
  searchQuery,
  hasValidationError,
  searchInputRef,
  rootRef,
  onToggle,
  onSearchChange,
  onSelect,
}: LookupCellProps): ReactNode {
  return (
    <div
      className={styles.lookupCell}
      ref={rootRef}
    >
      <button
        type="button"
        data-opening-stock-field-control="true"
        className={cx(
          styles.lookupTrigger,
          isOpen && styles.lookupTriggerOpen,
          hasValidationError && styles.requiredField,
        )}
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-invalid={hasValidationError || undefined}
      >
        <span
          className={cx(
            styles.lookupTriggerLabel,
            !selectedLabel && styles.lookupPlaceholder,
          )}
        >
          {selectedLabel || placeholder || header}
        </span>
        <FiChevronDown
          className={cx(styles.lookupChevron, isOpen && styles.lookupChevronOpen)}
          aria-hidden="true"
        />
      </button>
      {isOpen ? (
        <div
          className={styles.lookupMenu}
          data-opening-stock-lookup-menu="true"
        >
          <div className={styles.lookupSearchWrap}>
            <FiSearch
              className={styles.lookupSearchIcon}
              aria-hidden="true"
            />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder={placeholder || `Search ${header}`}
              className={styles.lookupSearchInput}
              autoComplete="off"
            />
          </div>
          <div
            className={styles.lookupOptions}
            role="listbox"
          >
            {options.length > 0 ? (
              options.map((option) => (
                <button
                  key={`${cellKey}-${option.value}`}
                  type="button"
                  className={cx(
                    styles.lookupOption,
                    option.value === selectedId && styles.lookupOptionActive,
                  )}
                  onClick={() => onSelect(option)}
                >
                  {option.label}
                </button>
              ))
            ) : (
              <div className={styles.lookupEmptyState}>
                {isLoading ? "Loading options..." : LOOKUP_FIELD_CONFIG[lookupKind].emptyMessage}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
