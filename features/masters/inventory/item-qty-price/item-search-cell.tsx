"use client";
import { type CSSProperties, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLazyGetItemOptionsQuery } from "@/store/api/lookupsApi";
import styles from "./item-qty-price.module.scss";

type ItemOption = { value: string; label: string };

type ItemSearchCellProps = {
  placeholder?: string;
  onSelect: (id: string, label: string) => void;
};

const SEARCH_DEBOUNCE_MS = 250;

// Always-visible search input (not hidden behind a trigger button) with its
// results dropdown rendered separately via a portal. After a pick, the input
// keeps showing the selected item's name until the user focuses it again to
// search for a different one.
export function ItemSearchCell({ placeholder, onSelect }: ItemSearchCellProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedLabel, setSelectedLabel] = useState("");
  const [options, setOptions] = useState<ItemOption[]>([]);
  const [dropdownStyle, setDropdownStyle] = useState<CSSProperties | undefined>(undefined);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [triggerSearch, { isFetching }] = useLazyGetItemOptionsQuery();

  const displayValue = isOpen ? query : selectedLabel;

  const updatePlacement = useCallback(() => {
    const input = inputRef.current;
    if (!input) return;
    const rect = input.getBoundingClientRect();
    setDropdownStyle({
      position: "fixed",
      left: `${rect.left}px`,
      top: `${rect.bottom + 2}px`,
      width: `${Math.max(rect.width, 220)}px`,
      zIndex: 2500,
    });
  }, []);

  useLayoutEffect(() => {
    if (!isOpen) return;
    updatePlacement();
  }, [isOpen, updatePlacement]);

  useEffect(() => {
    if (!isOpen) return;
    const timeoutId = window.setTimeout(() => {
      void triggerSearch(query.trim() ? { search: query.trim() } : undefined, true)
        .unwrap()
        .then((rows) => setOptions(rows.filter((row) => row.value)))
        .catch(() => setOptions([]));
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timeoutId);
  }, [isOpen, query, triggerSearch]);

  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (target && wrapperRef.current?.contains(target)) return;
      if (target && dropdownRef.current?.contains(target)) return;
      setIsOpen(false);
    };
    const handleWindowChange = () => updatePlacement();
    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("resize", handleWindowChange);
    window.addEventListener("scroll", handleWindowChange, true);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("resize", handleWindowChange);
      window.removeEventListener("scroll", handleWindowChange, true);
    };
  }, [isOpen, updatePlacement]);

  function handleFocus() {
    setQuery("");
    setIsOpen(true);
  }

  function handleOptionSelect(option: ItemOption) {
    onSelect(option.value, option.label);
    setSelectedLabel(option.label);
    setQuery("");
    setIsOpen(false);
  }

  const dropdown = isOpen ? (
    <div ref={dropdownRef} className={styles.itemDropdown} style={dropdownStyle}>
      <div className={styles.itemDropdownList}>
        {isFetching ? (
          <div className={styles.itemDropdownEmpty}>Searching…</div>
        ) : options.length ? (
          options.map((option) => (
            <button
              key={option.value}
              type="button"
              className={styles.itemDropdownOption}
              onMouseDown={(event) => {
                event.preventDefault();
                handleOptionSelect(option);
              }}
            >
              {option.label}
            </button>
          ))
        ) : (
          <div className={styles.itemDropdownEmpty}>No items found</div>
        )}
      </div>
    </div>
  ) : null;

  return (
    <div ref={wrapperRef} className={styles.itemSearchCell}>
      <input
        ref={inputRef}
        type="text"
        className={styles.cellInput}
        value={displayValue}
        placeholder={placeholder ?? "Search item"}
        autoComplete="off"
        onFocus={handleFocus}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            setIsOpen(false);
            inputRef.current?.blur();
          }
        }}
      />
      {dropdown && typeof document !== "undefined" ? createPortal(dropdown, document.body) : dropdown}
    </div>
  );
}
