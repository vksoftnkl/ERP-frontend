"use client";
import type { ReactNode } from "react";
import { FiDownload, FiPlus, FiSearch } from "react-icons/fi";

type StockToolbarProps = {
  searchQuery: string;
  voucherDate: string;
  isLoadingStock: boolean;
  isSavingOpeningStock: boolean;
  isBusinessContextLoading: boolean;
  loadedDocumentStatusText: string | null;
  configStatusText: string;
  contextStatusText: string;
  hasContextError: boolean;
  onSearchChange: (value: string) => void;
  onDateChange: (value: string) => void;
  onAddRow: () => void;
  onLoadStock: () => void;
  onUpdateStock: () => void;
};

export function StockToolbar({
  searchQuery,
  voucherDate,
  isLoadingStock,
  isSavingOpeningStock,
  isBusinessContextLoading,
  loadedDocumentStatusText,
  configStatusText,
  contextStatusText,
  hasContextError,
  onSearchChange,
  onDateChange,
  onAddRow,
  onLoadStock,
  onUpdateStock,
}: StockToolbarProps): ReactNode {
  const isBusy = isLoadingStock || isSavingOpeningStock || isBusinessContextLoading;

  return (
    <div className="flex flex-col gap-2 border-b border-[#e8eef5] bg-[#fafcff] px-4 py-3">
      {/* Controls row */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative flex items-center">
          <FiSearch
            className="pointer-events-none absolute left-3 h-4 w-4 text-[#8c9caf]"
            aria-hidden="true"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search visible stock values"
            className="h-11 min-w-[220px] rounded-md border border-[#d7e0ea] bg-white py-2 pl-9 pr-3 text-sm text-[#1b2634] placeholder:text-[#93a0af] focus-visible:outline-none focus-visible:border-[#8ab4ff] focus-visible:ring-4 focus-visible:ring-blue-500/20"
            autoComplete="off"
          />
        </div>

        {/* Voucher Date */}
        <label className="inline-flex min-h-11 items-center gap-2.5">
          <span className="whitespace-nowrap text-[0.78rem] font-bold tracking-[0.01em] text-[#5d6d80]">
            Voucher Date
          </span>
          <input
            type="date"
            value={voucherDate}
            onChange={(event) => onDateChange(event.target.value)}
            className="h-11 w-[min(100%,190px)] min-w-[170px] rounded border border-[#d7e0ea] bg-white px-3 py-2 text-sm text-[#1b2634] transition-all duration-150 focus-visible:outline-none focus-visible:border-[#8ab4ff] focus-visible:ring-4 focus-visible:ring-blue-500/20"
          />
        </label>

        {/* Add line */}
        <button
          type="button"
          onClick={onAddRow}
          className="inline-flex h-11 items-center gap-1.5 rounded border border-[#2d5fa8] bg-gradient-to-b from-[#4f76bb] to-[#3d66ad] px-4 py-2 text-sm font-bold text-white transition-all duration-150 hover:shadow-[0_10px_20px_rgba(54,91,157,0.24)] disabled:opacity-50"
        >
          <FiPlus className="h-4 w-4" aria-hidden="true" />
          <span>Add line</span>
        </button>

        {/* Load stock */}
        <button
          type="button"
          onClick={onLoadStock}
          disabled={isBusy}
          className="inline-flex h-11 items-center gap-1.5 rounded border border-[#2d5fa8] bg-gradient-to-b from-[#4f76bb] to-[#365b9d] px-4 py-2 text-sm font-bold text-white transition-all duration-150 hover:shadow-[0_10px_20px_rgba(54,91,157,0.24)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <FiDownload className="h-4 w-4" aria-hidden="true" />
          <span>{isLoadingStock ? "Loading..." : "Load the Stock"}</span>
        </button>

        {/* Update stock */}
        <button
          type="button"
          onClick={onUpdateStock}
          disabled={isBusy}
          className="inline-flex h-11 items-center gap-1.5 rounded border border-[#0d6b3b] bg-gradient-to-b from-[#1f9d5a] to-[#0f7a43] px-4 py-2 text-sm font-bold text-white transition-all duration-150 hover:shadow-[0_10px_20px_rgba(15,122,67,0.24)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span>{isSavingOpeningStock ? "Updating..." : "Update Stock"}</span>
        </button>
      </div>

      {/* Loaded document meta */}
      {loadedDocumentStatusText && (
        <p className="mt-1 text-[0.84rem] font-bold leading-[1.45] text-[#365b9d]">
          {loadedDocumentStatusText}
        </p>
      )}

      {/* Context + config status */}
      <p
        className={[
          "text-[0.82rem] font-bold leading-[1.4]",
          hasContextError ? "text-[#9d3d33]" : "text-[#4c6784]",
        ].join(" ")}
      >
        {contextStatusText} {configStatusText}
      </p>
    </div>
  );
}