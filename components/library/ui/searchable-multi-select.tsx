"use client";

import {
  type CSSProperties,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { cx } from "@/components/library/cx";
import type { ERPDynamicSelectOption } from "@/components/library/ui/dynamic-modal-form";
import {
  KeyboardShortcutHints,
  type KeyboardShortcutDefinition,
} from "@/components/library/ui/keyboard-shortcut-hints";
import dynamicFormStyles from "@/components/library/ui/dynamic-modal-form.module.scss";

export type SearchableMultiSelectProps = {
  id?: string;
  values: readonly string[];
  options: readonly ERPDynamicSelectOption[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  className?: string;
  maxDropdownHeight?: number;
  name?: string;
};

const DEFAULT_DROPDOWN_MAX_HEIGHT = 280;
const SEARCHABLE_MULTI_SELECT_SHORTCUTS: readonly KeyboardShortcutDefinition[] = [
  {
    label: "Navigate",
    keys: ["ArrowUp", "ArrowDown"],
  },
  {
    label: "Toggle",
    keys: ["Enter", "Space"],
  },
  {
    label: "Close",
    keys: ["Escape"],
  },
];

function normalizeSearchValue(value: string): string {
  return value.trim().toLowerCase();
}

export function SearchableMultiSelect({
  id,
  values,
  options,
  onChange,
  placeholder,
  searchPlaceholder,
  emptyText = "No options found.",
  disabled = false,
  className,
  maxDropdownHeight = DEFAULT_DROPDOWN_MAX_HEIGHT,
  name,
}: SearchableMultiSelectProps) {
  const generatedId = useId();
  const controlId = id ?? `searchable-multi-select-${generatedId}`;
  const listId = `${controlId}-listbox`;
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [placement, setPlacement] = useState<"down" | "up">("down");

  const selectedValueSet = useMemo(
    () => new Set(values.map((value) => value.trim()).filter(Boolean)),
    [values],
  );

  const filteredOptions = useMemo(() => {
    const normalizedQuery = normalizeSearchValue(query);
    if (!normalizedQuery) return [...options];

    return options.filter((option) => {
      const label = normalizeSearchValue(option.label);
      const optionValue = normalizeSearchValue(option.value);
      return label.includes(normalizedQuery) || optionValue.includes(normalizedQuery);
    });
  }, [options, query]);

  const selectedSummary = useMemo(() => {
    if (selectedValueSet.size === 0) {
      return "";
    }

    const selectedLabels = options
      .filter((option) => selectedValueSet.has(option.value))
      .map((option) => option.label);

    const knownValueSet = new Set(options.map((option) => option.value));
    const fallbackLabels = values.filter((value) => !knownValueSet.has(value));

    return [...selectedLabels, ...fallbackLabels].join(", ");
  }, [options, selectedValueSet, values]);

  const activeDescendantId =
    isOpen && highlightedIndex >= 0
      ? `${controlId}-option-${highlightedIndex}`
      : undefined;
  const styleVars = {
    "--erp-modal-control-height": "2.15rem",
    "--erp-modal-control-padding-y": "0.5rem",
    "--erp-modal-control-padding-x": "0.5rem",
    "--erp-modal-accent": "#0f766e",
    "--erp-modal-accent-soft-ring": "rgba(15, 118, 110, 0.14)",
  } as CSSProperties;

  const updatePlacement = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const preferredHeight = Math.min(
      maxDropdownHeight,
      Math.max(180, filteredOptions.length * 36 + 56),
    );

    setPlacement(spaceBelow < preferredHeight && spaceAbove > spaceBelow ? "up" : "down");
  }, [filteredOptions.length, maxDropdownHeight]);

  const closeDropdown = useCallback((restoreFocus = false) => {
    setIsOpen(false);
    setQuery("");
    setHighlightedIndex(-1);
    if (restoreFocus) {
      window.requestAnimationFrame(() => triggerRef.current?.focus());
    }
  }, []);

  const openDropdown = useCallback(() => {
    if (disabled) return;

    setIsOpen(true);
    setQuery("");
    setHighlightedIndex(0);
  }, [disabled]);

  const toggleSelection = useCallback(
    (nextValue: string) => {
      const normalizedNextValue = nextValue.trim();
      if (!normalizedNextValue) {
        return;
      }

      const nextSelectedValues = new Set(
        values.map((value) => value.trim()).filter(Boolean),
      );
      if (nextSelectedValues.has(normalizedNextValue)) {
        nextSelectedValues.delete(normalizedNextValue);
      } else {
        nextSelectedValues.add(normalizedNextValue);
      }

      const orderedValues = options
        .map((option) => option.value)
        .filter((value) => nextSelectedValues.has(value));

      onChange(orderedValues);
    },
    [onChange, options, values],
  );

  const handleTriggerKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>) => {
      if (disabled) return;

      switch (event.key) {
        case "ArrowDown":
        case "ArrowUp":
        case "Enter":
        case " ":
          event.preventDefault();
          if (!isOpen) {
            openDropdown();
          }
          break;
        case "Escape":
          if (isOpen) {
            event.preventDefault();
            closeDropdown();
          }
          break;
      }
    },
    [closeDropdown, disabled, isOpen, openDropdown],
  );

  const handleSearchKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (!isOpen) return;

      switch (event.key) {
        case "ArrowDown":
          event.preventDefault();
          setHighlightedIndex((current) =>
            filteredOptions.length === 0 ? -1 : Math.min(current + 1, filteredOptions.length - 1),
          );
          break;
        case "ArrowUp":
          event.preventDefault();
          setHighlightedIndex((current) =>
            filteredOptions.length === 0 ? -1 : Math.max(current - 1, 0),
          );
          break;
        case "Enter":
        case " ":
          event.preventDefault();
          if (highlightedIndex >= 0 && highlightedIndex < filteredOptions.length) {
            toggleSelection(filteredOptions[highlightedIndex].value);
          }
          break;
        case "Escape":
          event.preventDefault();
          closeDropdown(true);
          break;
        case "Tab":
          closeDropdown();
          break;
      }
    },
    [closeDropdown, filteredOptions, highlightedIndex, isOpen, toggleSelection],
  );

  // Run placement calculation synchronously before paint to prevent flicker
  useLayoutEffect(() => {
    if (!isOpen) return;
    updatePlacement();
  }, [isOpen, updatePlacement]);

  useEffect(() => {
    if (!isOpen) return;

    const rafId = window.requestAnimationFrame(() => searchInputRef.current?.focus());

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (target && wrapperRef.current?.contains(target)) return;
      closeDropdown();
    };

    const handleWindowChange = () => {
      updatePlacement();
    };

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("resize", handleWindowChange);
    window.addEventListener("scroll", handleWindowChange, true);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("resize", handleWindowChange);
      window.removeEventListener("scroll", handleWindowChange, true);
    };
  }, [closeDropdown, isOpen, updatePlacement]);

  useEffect(() => {
    if (!isOpen) return;

    setHighlightedIndex((current) => {
      if (filteredOptions.length === 0) return -1;
      if (current >= 0 && current < filteredOptions.length) return current;
      return 0;
    });
  }, [filteredOptions, isOpen]);

  return (
    <div
      className={cx(dynamicFormStyles.searchSelect, className)}
      ref={wrapperRef}
      style={styleVars}
    >
      {name ? <input type="hidden" name={name} value={values.join(",")} /> : null}
      <button
        ref={triggerRef}
        id={controlId}
        type="button"
        className={cx(
          dynamicFormStyles.searchSelectTrigger,
          dynamicFormStyles.searchMultiSelectControl,
          isOpen && dynamicFormStyles.searchSelectTriggerOpen,
          disabled && dynamicFormStyles.searchSelectTriggerDisabled,
        )}
        role="combobox"
        aria-expanded={isOpen}
        aria-controls={listId}
        aria-activedescendant={activeDescendantId}
        disabled={disabled}
        onClick={() => (isOpen ? closeDropdown() : openDropdown())}
        onKeyDown={handleTriggerKeyDown}
      >
        <span
          className={cx(
            dynamicFormStyles.searchSelectTriggerSingleValue,
            !selectedSummary && dynamicFormStyles.searchSelectTriggerPlaceholder,
          )}
        >
          {selectedSummary || placeholder || "Select options"}
        </span>
        <span
          className={dynamicFormStyles.searchSelectChevronSlot}
          aria-hidden="true"
        >
          <svg
            viewBox="0 0 20 20"
            className={cx(
              dynamicFormStyles.searchSelectChevron,
              isOpen && dynamicFormStyles.searchSelectChevronOpen,
            )}
          >
            <path
              d="M5 7.5 10 12.5 15 7.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </button>
      {isOpen ? (
        <div
          id={listId}
          className={cx(
            dynamicFormStyles.searchSelectList,
            placement === "up" && dynamicFormStyles.searchSelectListUp,
          )}
          style={{ maxHeight: `${maxDropdownHeight}px` }}
        >
          <div className={dynamicFormStyles.searchSelectSearchWrap}>
            <input
              ref={searchInputRef}
              type="text"
              value={query}
              placeholder={searchPlaceholder ?? "Search options"}
              className={dynamicFormStyles.searchSelectSearchInput}
              role="searchbox"
              onChange={(event) => setQuery(event.currentTarget.value)}
              onKeyDown={handleSearchKeyDown}
              onBlur={() => {
                window.setTimeout(() => {
                  const activeElement = document.activeElement;
                  if (activeElement instanceof Node && wrapperRef.current?.contains(activeElement)) {
                    return;
                  }
                  closeDropdown();
                }, 0);
              }}
            />
            <span className={dynamicFormStyles.searchSelectSearchIcon} aria-hidden="true">
              <svg viewBox="0 0 20 20">
                <path
                  d="M8.6 3.5a5.1 5.1 0 1 1 0 10.2 5.1 5.1 0 0 1 0-10.2Zm0 1.6a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Zm4.7 8.7 3.2 3.2"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          </div>
          <ul className={dynamicFormStyles.searchSelectOptions} role="listbox" aria-multiselectable="true">
            {filteredOptions.length ? (
              filteredOptions.map((option, optionIndex) => (
                <li
                  id={`${controlId}-option-${optionIndex}`}
                  key={`${controlId}-${option.value || "__empty"}`}
                  className={cx(
                    dynamicFormStyles.searchSelectOption,
                    (optionIndex === highlightedIndex || selectedValueSet.has(option.value)) &&
                      dynamicFormStyles.searchSelectOptionActive,
                  )}
                  role="option"
                  aria-selected={selectedValueSet.has(option.value)}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    toggleSelection(option.value);
                  }}
                  onMouseEnter={() => setHighlightedIndex(optionIndex)}
                >
                  <input
                    type="checkbox"
                    checked={selectedValueSet.has(option.value)}
                    readOnly
                    tabIndex={-1}
                    aria-hidden="true"
                  />
                  {option.label}
                </li>
              ))
            ) : (
              <li className={dynamicFormStyles.searchSelectEmpty}>{emptyText}</li>
            )}
          </ul>
          <div className={dynamicFormStyles.searchSelectShortcutBar}>
            <KeyboardShortcutHints
              shortcuts={SEARCHABLE_MULTI_SELECT_SHORTCUTS}
              dense
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default SearchableMultiSelect;
