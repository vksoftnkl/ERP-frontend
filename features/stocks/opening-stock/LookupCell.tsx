"use client";
import { type ReactNode, useRef } from "react";
import { FiChevronDown, FiSearch } from "react-icons/fi";
import type { ERPDynamicSelectOption } from "@/components/library/ui";
import type { LookupKind } from "./Types";
import { LOOKUP_FIELD_CONFIG } from "./constants";

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
  searchInputRef?: React.RefObject<HTMLInputElement | null>;
  rootRef?: (element: HTMLDivElement | null) => void;
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
  searchInputRef,
  rootRef,
  onToggle,
  onSearchChange,
  onSelect,
}: LookupCellProps): ReactNode {
  return (
    <div className="relative min-w-44" ref={rootRef}>
      {/* Trigger button */}
      <button
        type="button"
        data-opening-stock-field-control="true"
        className={[
          "inline-flex w-full min-w-44 min-h-10 items-center justify-between gap-2",
          "rounded border bg-white px-3 py-2 text-left font-[inherit] text-sm leading-tight",
          "cursor-pointer transition-all duration-150",
          "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/20",
          isOpen
            ? "border-[#8ab4ff] ring-4 ring-blue-500/20"
            : "border-[#d7e0ea] text-[#1b2634] hover:border-[#b0c4da]",
        ].join(" ")}
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <span
          className={[
            "min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap",
            !selectedLabel ? "text-[#93a0af]" : "text-[#1b2634]",
          ].join(" ")}
        >
          {selectedLabel || placeholder || header}
        </span>
        <FiChevronDown
          className={[
            "h-4 w-4 flex-none text-[#617488] transition-transform duration-150",
            isOpen ? "rotate-180" : "",
          ].join(" ")}
          aria-hidden="true"
        />
      </button>

      {/* Dropdown menu */}
      {isOpen && (
        <div
          className="absolute left-0 right-0 top-[calc(100%+6px)] z-[12] flex flex-col gap-2 rounded-xl border border-[#d7e0ea] bg-white p-2 shadow-[0_16px_36px_rgba(15,35,60,0.18)]"
          data-opening-stock-lookup-menu="true"
        >
          {/* Search input */}
          <div className="relative">
            <FiSearch
              className="pointer-events-none absolute left-3 top-1/2 h-[0.95rem] w-[0.95rem] -translate-y-1/2 text-[#8c9caf]"
              aria-hidden="true"
            />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder={placeholder || `Search ${header}`}
              className="w-full min-h-10 rounded border border-[#d7e0ea] bg-white py-2 pl-9 pr-3 font-[inherit] text-sm text-[#1b2634] transition-all duration-150 placeholder:text-[#93a0af] focus-visible:outline-none focus-visible:border-[#8ab4ff] focus-visible:ring-4 focus-visible:ring-blue-500/20"
              autoComplete="off"
            />
          </div>

          {/* Options list */}
          <div className="flex max-h-[15.5rem] flex-col gap-0.5 overflow-y-auto" role="listbox">
            {options.length > 0 ? (
              options.map((option) => (
                <button
                  key={`${cellKey}-${option.value}`}
                  type="button"
                  className={[
                    "w-full rounded-lg border-0 px-3 py-2 text-left font-[inherit] text-sm cursor-pointer",
                    "transition-colors duration-150",
                    option.value === selectedId
                      ? "bg-[#dbeafe] font-bold text-[#173b63]"
                      : "bg-transparent text-[#1b2634] hover:bg-[#eef5ff]",
                  ].join(" ")}
                  onClick={() => onSelect(option)}
                >
                  {option.label}
                </button>
              ))
            ) : (
              <div className="px-3 py-2 text-sm text-[#6d7f92]">
                {isLoading ? "Loading options..." : LOOKUP_FIELD_CONFIG[lookupKind].emptyMessage}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}