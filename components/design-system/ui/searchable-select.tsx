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
import { createPortal } from "react-dom";
import { cx } from "@/components/design-system/cx";
import type { ERPDynamicSelectOption } from "@/components/design-system/ui/dynamic-modal-form";
import dynamicFormStyles from "@/components/design-system/ui/dynamic-modal-form.module.scss";
export type SearchableSelectProps = {
  id?: string;
  value: string;
  options: readonly ERPDynamicSelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  invalid?: boolean;
  className?: string;
  maxDropdownHeight?: number;
  name?: string;
};
const DEFAULT_DROPDOWN_MAX_HEIGHT = 280;
const DROPDOWN_VIEWPORT_PADDING = 8;
const DROPDOWN_PORTAL_Z_INDEX = 2500;
function normalizeSearchValue(value: string): string {
  return value.trim().toLowerCase();
}
export function SearchableSelect({
  id,
  value,
  options,
  onChange,
  placeholder,
  searchPlaceholder,
  emptyText = "No options found.",
  disabled = false,
  invalid = false,
  className,
  maxDropdownHeight = DEFAULT_DROPDOWN_MAX_HEIGHT,
  name,
}: SearchableSelectProps) {
  const generatedId = useId();
  const controlId = id ?? `searchable-select-${generatedId}`;
  const listId = `${controlId}-listbox`;
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [placement, setPlacement] = useState<"down" | "up">("down");
  const [dropdownStyle, setDropdownStyle] = useState<CSSProperties | undefined>(undefined);
  const selectedOption = useMemo(
    () => options.find((option) => option.value === value) ?? null,
    [options, value],
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
    const preferredHeight = Math.min(maxDropdownHeight, Math.max(180, filteredOptions.length * 36 + 56));
    const nextPlacement = spaceBelow < preferredHeight && spaceAbove > spaceBelow ? "up" : "down";
    const availableHeight =
      nextPlacement === "up"
        ? spaceAbove - DROPDOWN_VIEWPORT_PADDING - 4
        : window.innerHeight - rect.bottom - DROPDOWN_VIEWPORT_PADDING - 4;
    const dropdownWidth = Math.min(
      rect.width,
      Math.max(0, window.innerWidth - DROPDOWN_VIEWPORT_PADDING * 2),
    );
    const dropdownLeft = Math.max(
      DROPDOWN_VIEWPORT_PADDING,
      Math.min(rect.left, window.innerWidth - dropdownWidth - DROPDOWN_VIEWPORT_PADDING),
    );
    setPlacement(nextPlacement);
    setDropdownStyle({
      position: "fixed",
      left: `${dropdownLeft}px`,
      right: "auto",
      width: `${dropdownWidth}px`,
      maxHeight: `${Math.min(maxDropdownHeight, Math.max(120, availableHeight))}px`,
      zIndex: DROPDOWN_PORTAL_Z_INDEX,
      ...(nextPlacement === "up"
        ? {
            top: "auto",
            bottom: `${window.innerHeight - rect.top + 4}px`,
          }
        : {
            top: `${rect.bottom + 4}px`,
            bottom: "auto",
          }),
    });
  }, [filteredOptions.length, maxDropdownHeight]);
  const closeDropdown = useCallback((restoreFocus = false) => {
    setIsOpen(false);
    setQuery("");
    setHighlightedIndex(-1);
    setDropdownStyle(undefined);
    if (restoreFocus) {
      window.requestAnimationFrame(() => triggerRef.current?.focus());
    }
  }, []);
  const openDropdown = useCallback(() => {
    if (disabled) return;
    const selectedIndex = options.findIndex((option) => option.value === value);
    setIsOpen(true);
    setQuery("");
    setHighlightedIndex(selectedIndex >= 0 ? selectedIndex : 0);
  }, [disabled, options, value]);
  const commitSelection = useCallback((nextValue: string) => {
    onChange(nextValue);
    closeDropdown(true);
  }, [closeDropdown, onChange]);
  const clearSelection = useCallback(() => {
    onChange("");
    closeDropdown(false);
  }, [closeDropdown, onChange]);
  const handleTriggerKeyDown = useCallback((event: KeyboardEvent<HTMLButtonElement>) => {
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
  }, [closeDropdown, disabled, isOpen, openDropdown]);
  const handleSearchKeyDown = useCallback((event: KeyboardEvent<HTMLInputElement>) => {
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
        event.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < filteredOptions.length) {
          commitSelection(filteredOptions[highlightedIndex].value);
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
  }, [closeDropdown, commitSelection, filteredOptions, highlightedIndex, isOpen]);
  // Run position calculation synchronously before paint to prevent flicker
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
      if (target && dropdownRef.current?.contains(target)) return;
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
  const dropdown = isOpen ? (
    <div
      ref={dropdownRef}
      id={listId}
      className={cx(
        dynamicFormStyles.searchSelectList,
        placement === "up" && dynamicFormStyles.searchSelectListUp,
      )}
      style={dropdownStyle
        ? dropdownStyle
        : { maxHeight: `${maxDropdownHeight}px`, visibility: "hidden" }}
    >
      <div className={dynamicFormStyles.searchSelectSearchWrap}>
        <input
          ref={searchInputRef}
          type="text"
          value={query}
          placeholder={searchPlaceholder ?? "Search options"}
          className={dynamicFormStyles.searchSelectSearchInput}
          role="searchbox"
          autoComplete="off"
          onChange={(event) => setQuery(event.currentTarget.value)}
          onKeyDown={handleSearchKeyDown}
          onBlur={() => {
            window.setTimeout(() => {
              const activeElement = document.activeElement;
              if (activeElement instanceof Node && wrapperRef.current?.contains(activeElement)) {
                return;
              }
              if (activeElement instanceof Node && dropdownRef.current?.contains(activeElement)) {
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
      <ul className={dynamicFormStyles.searchSelectOptions} role="listbox">
        {filteredOptions.length ? (
          filteredOptions.map((option, optionIndex) => (
            <li
              id={`${controlId}-option-${optionIndex}`}
              key={`${controlId}-${option.value || "__empty"}`}
              className={cx(
                dynamicFormStyles.searchSelectOption,
                (optionIndex === highlightedIndex || option.value === value) &&
                  dynamicFormStyles.searchSelectOptionActive,
              )}
              role="option"
              aria-selected={option.value === value}
              onMouseDown={(event) => {
                event.preventDefault();
                commitSelection(option.value);
              }}
              onMouseEnter={() => setHighlightedIndex(optionIndex)}
            >
              {option.label}
            </li>
          ))
        ) : (
          <li className={dynamicFormStyles.searchSelectEmpty}>{emptyText}</li>
        )}
      </ul>
    </div>
  ) : null;
  return (
    <div
      className={cx(dynamicFormStyles.searchSelect, className)}
      ref={wrapperRef}
      style={styleVars}
    >
      {name ? <input type="hidden" name={name} value={value} /> : null}
      <button
        ref={triggerRef}
        id={controlId}
        type="button"
        className={cx(
          dynamicFormStyles.searchSelectTrigger,
          selectedOption && dynamicFormStyles.searchSelectTriggerClearable,
          invalid && dynamicFormStyles.controlInvalid,
          isOpen && dynamicFormStyles.searchSelectTriggerOpen,
          disabled && dynamicFormStyles.searchSelectTriggerDisabled,
        )}
        role="combobox"
        aria-expanded={isOpen}
        aria-controls={listId}
        aria-activedescendant={activeDescendantId}
        aria-invalid={invalid ? true : undefined}
        disabled={disabled}
        onClick={() => (isOpen ? closeDropdown() : openDropdown())}
        onKeyDown={handleTriggerKeyDown}
      >
        <span
          className={cx(
            dynamicFormStyles.searchSelectTriggerSingleValue,
            !selectedOption && dynamicFormStyles.searchSelectTriggerPlaceholder,
          )}
        >
          {selectedOption?.label ?? placeholder ?? "Select option"}
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
      {selectedOption && !disabled ? (
        <button
          type="button"
          className={dynamicFormStyles.searchSelectClearButton}
          aria-label="Clear selected option"
          onMouseDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onClick={(event) => {
            event.stopPropagation();
            clearSelection();
          }}
        >
          x
        </button>
      ) : null}
      {dropdown && typeof document !== "undefined"
        ? createPortal(dropdown, document.body)
        : dropdown}
    </div>
  );
}
export default SearchableSelect;