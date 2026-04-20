"use client";

import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type RefObject } from "react";
import { FiChevronDown, FiSearch } from "react-icons/fi";
import type { ERPDynamicSelectOption } from "@/components/library/ui";
import { LOOKUP_FIELD_CONFIG } from "./constants";
import type { LookupKind } from "./Types";
import { cx } from "./Utils";
import styles from "./page.module.scss";

type LookupCellProps = {
  rowId: number;
  fieldKey: string;
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
  onTriggerKeyDown?: (event: ReactKeyboardEvent<HTMLButtonElement>) => void;
  onSearchChange: (search: string) => void;
  onSelect: (option: ERPDynamicSelectOption) => void;
};

function getInitialHighlightedIndex(
  options: ERPDynamicSelectOption[],
  selectedId: string,
): number {
  if (options.length === 0) {
    return -1;
  }

  const selectedIndex = options.findIndex((option) => option.value === selectedId);
  return selectedIndex >= 0 ? selectedIndex : 0;
}

export function LookupCell({
  rowId,
  fieldKey,
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
  onTriggerKeyDown,
  onSearchChange,
  onSelect,
}: LookupCellProps): ReactNode {
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const optionRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const listboxId = `${cellKey}-lookup-listbox`;
  const activeOption = highlightedIndex >= 0 ? options[highlightedIndex] : undefined;
  const activeOptionId = activeOption ? `${cellKey}-${activeOption.value}-option` : undefined;

  useEffect(() => {
    setHighlightedIndex(isOpen ? getInitialHighlightedIndex(options, selectedId) : -1);
  }, [isOpen, options, selectedId]);

  useEffect(() => {
    if (!isOpen || !activeOption) {
      return;
    }

    optionRefs.current[activeOption.value]?.scrollIntoView({
      block: "nearest",
    });
  }, [activeOption, isOpen]);

  function handleSearchKeyDown(event: ReactKeyboardEvent<HTMLInputElement>): void {
    if (event.altKey || event.ctrlKey || event.metaKey) {
      return;
    }

    if (event.key === "ArrowDown") {
      if (options.length === 0) {
        return;
      }

      event.preventDefault();
      setHighlightedIndex((currentIndex) =>
        Math.min(currentIndex < 0 ? 0 : currentIndex + 1, options.length - 1),
      );
      return;
    }

    if (event.key === "ArrowUp") {
      if (options.length === 0) {
        return;
      }

      event.preventDefault();
      setHighlightedIndex((currentIndex) => Math.max(currentIndex <= 0 ? 0 : currentIndex - 1, 0));
      return;
    }

    if (event.key === "Enter") {
      if (!activeOption) {
        return;
      }

      event.preventDefault();
      onSelect(activeOption);
    }
  }

  return (
    <div
      className={styles.lookupCell}
      ref={rootRef}
    >
      <button
        type="button"
        data-opening-stock-field-control="true"
        data-opening-stock-row-id={rowId}
        data-opening-stock-field-key={fieldKey}
        className={cx(
          styles.lookupTrigger,
          isOpen && styles.lookupTriggerOpen,
          hasValidationError && styles.requiredField,
        )}
        onClick={onToggle}
        onKeyDown={onTriggerKeyDown}
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
              onKeyDown={handleSearchKeyDown}
              placeholder={placeholder || `Search ${header}`}
              className={styles.lookupSearchInput}
              autoComplete="off"
              aria-controls={listboxId}
              aria-activedescendant={activeOptionId}
              aria-expanded={isOpen}
            />
          </div>
          <div
            className={styles.lookupOptions}
            id={listboxId}
            role="listbox"
          >
            {options.length > 0 ? (
              options.map((option, index) => (
                <button
                  key={`${cellKey}-${option.value}`}
                  id={`${cellKey}-${option.value}-option`}
                  type="button"
                  className={cx(
                    styles.lookupOption,
                    index === highlightedIndex && styles.lookupOptionActive,
                  )}
                  role="option"
                  aria-selected={option.value === selectedId}
                  ref={(element) => {
                    optionRefs.current[option.value] = element;
                  }}
                  onMouseEnter={() => setHighlightedIndex(index)}
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
