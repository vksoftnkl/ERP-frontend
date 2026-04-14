"use client";
import type { ReactNode } from "react";
import { FiMoreVertical, FiTrash2 } from "react-icons/fi";
import type { ERPDynamicSelectOption } from "@/components/library/ui";
import type { ItemPriceDetailsPayload } from "@/store/api/lookupsApi";
import { buildUomOptions } from "./Utils";
import type { ColumnDefinition, LookupKind, OpeningStockRow } from "./Types";
import { LOOKUP_FIELD_CONFIG } from "./constants";
import { LookupCell } from "./LookupCell";

type StockTableRowProps = {
  row: OpeningStockRow;
  rowIndex: number;
  columns: ColumnDefinition[];
  isEven: boolean;
  openRowActionMenuId: number | null;
  openLookupCell: { key: string; kind: LookupKind } | null;
  lookupSearchQuery: string;
  filteredItemOptions: ERPDynamicSelectOption[];
  filteredGodownOptions: ERPDynamicSelectOption[];
  isItemLookupLoading: boolean;
  isGodownLookupLoading: boolean;
  itemOptionsByValue: Map<string, string>;
  godownOptionsByValue: Map<string, string>;
  unitOptionsByValue: Map<string, string>;
  taxSelectOptions: ERPDynamicSelectOption[];
  itemDetailsByItemId: Record<string, ItemPriceDetailsPayload>;
  lookupSearchInputRef: React.RefObject<HTMLInputElement | null>;
  actionRootRef: (element: HTMLDivElement | null) => void;
  lookupRootRef: (key: string, element: HTMLDivElement | null) => void;
  onRowChange: (rowId: number, field: string, value: string) => void;
  onUomChange: (rowId: number, unitId: string) => void;
  onTaxChange: (rowId: number, taxId: string) => void;
  onLookupSelection: (rowId: number, lookupKind: LookupKind, option: ERPDynamicSelectOption) => void;
  onLookupSearchChange: (lookupKind: LookupKind, search: string) => void;
  onToggleLookup: (cellKey: string, lookupKind: LookupKind) => void;
  onToggleRowActions: (rowId: number) => void;
  onRemoveRow: (rowId: number) => void;
  setLookupSearchQuery: (q: string) => void;
};

const cellInputClass =
  "w-full min-w-44 min-h-10 rounded border border-[#d7e0ea] bg-white px-3 py-2 text-sm text-[#1b2634] font-[inherit] leading-tight transition-all duration-150 placeholder:text-[#93a0af] focus-visible:outline-none focus-visible:border-[#8ab4ff] focus-visible:ring-4 focus-visible:ring-blue-500/20";

const cellSelectClass =
  "w-full min-w-44 min-h-10 cursor-pointer rounded border border-[#d7e0ea] bg-white px-3 py-2 text-sm text-[#1b2634] font-[inherit] leading-tight transition-all duration-150 focus-visible:outline-none focus-visible:border-[#8ab4ff] focus-visible:ring-4 focus-visible:ring-blue-500/20";

const numericInputClass =
  "w-full min-w-[8.75rem] min-h-10 text-right tabular-nums rounded border border-[#d7e0ea] bg-white px-3 py-2 text-sm text-[#1b2634] font-[inherit] leading-tight transition-all duration-150 placeholder:text-[#93a0af] focus-visible:outline-none focus-visible:border-[#8ab4ff] focus-visible:ring-4 focus-visible:ring-blue-500/20 appearance-none [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";

export function StockTableRow({
  row,
  rowIndex,
  columns,
  isEven,
  openRowActionMenuId,
  openLookupCell,
  lookupSearchQuery,
  filteredItemOptions,
  filteredGodownOptions,
  isItemLookupLoading,
  isGodownLookupLoading,
  itemOptionsByValue,
  godownOptionsByValue,
  unitOptionsByValue,
  taxSelectOptions,
  itemDetailsByItemId,
  lookupSearchInputRef,
  actionRootRef,
  lookupRootRef,
  onRowChange,
  onUomChange,
  onTaxChange,
  onLookupSelection,
  onLookupSearchChange,
  onToggleLookup,
  onToggleRowActions,
  onRemoveRow,
  setLookupSearchQuery,
}: StockTableRowProps): ReactNode {
  const currentItemId = row.values.oslitemid?.trim() ?? "";
  const currentItemDetail = currentItemId ? itemDetailsByItemId[currentItemId] : undefined;
  const uomSelectOptions = buildUomOptions(currentItemDetail, unitOptionsByValue);

  return (
    <tr className={isEven ? "bg-[#fafcff] hover:bg-[#f7fbff]" : "bg-white hover:bg-[#f7fbff]"}>
      {/* Serial number + actions */}
      <td className="sticky left-0 z-[3] border-b border-[#eef3f8] bg-inherit px-2 py-1.5 align-middle shadow-[1px_0_0_#e8eef5]">
        <div className="inline-flex w-full items-center justify-between gap-1.5">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#eef5ff] text-[0.84rem] font-bold text-[#244f8a]">
            {rowIndex + 1}
          </span>
          <div
            className="relative"
            ref={actionRootRef}
          >
            <button
              type="button"
              className="rounded p-1 text-[#8c9caf] transition-colors hover:bg-[#f0f4f8] hover:text-[#1b2634]"
              aria-label={`Open actions for row ${rowIndex + 1}`}
              aria-haspopup="menu"
              aria-expanded={openRowActionMenuId === row.id}
              onClick={(event) => { event.stopPropagation(); onToggleRowActions(row.id); }}
              onMouseDown={(event) => event.stopPropagation()}
            >
              <FiMoreVertical className="h-4 w-4" aria-hidden="true" />
            </button>
            {openRowActionMenuId === row.id && (
              <div
                className="absolute left-0 top-full z-[14] mt-1 min-w-[140px] rounded-lg border border-[#e0e8f0] bg-white py-1 shadow-[0_8px_24px_rgba(15,35,60,0.14)]"
                role="menu"
                aria-label={`Actions for row ${rowIndex + 1}`}
              >
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-[#c0392b] transition-colors hover:bg-[#fff5f5]"
                  onClick={(event) => { event.stopPropagation(); onRemoveRow(row.id); }}
                >
                  <FiTrash2 className="h-4 w-4" aria-hidden="true" />
                  <span>Remove row</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </td>

      {/* Data columns */}
      {columns.map((column, columnIndex) => {
        const value = row.values[column.key] ?? "";
        const lookupKind = column.lookupKind;
        const lookupFieldConfig = lookupKind ? LOOKUP_FIELD_CONFIG[lookupKind] : null;
        const cellLookupKey = `${row.id}:${column.key}`;
        const isLookupOpen = openLookupCell?.key === cellLookupKey;
        const selectedLookupId = lookupFieldConfig ? row.values[lookupFieldConfig.idField] ?? "" : "";
        const selectedLookupLabel = lookupKind
          ? ((lookupKind === "item" ? itemOptionsByValue.get(selectedLookupId) : godownOptionsByValue.get(selectedLookupId)) ?? value)
          : value;
        const lookupOptions = lookupKind
          ? lookupKind === "item" ? filteredItemOptions : filteredGodownOptions
          : [];
        const isLookupLoading = lookupKind
          ? lookupKind === "item" ? isItemLookupLoading : isGodownLookupLoading
          : false;

        const alignClass = column.align === "right"
          ? "text-right"
          : column.align === "center"
            ? "text-center"
            : "text-left";

        return (
          <td
            key={column.key}
            data-label={column.header}
            data-opening-stock-field-container="true"
            data-opening-stock-row-index={rowIndex}
            data-opening-stock-column-index={columnIndex}
            className={`border-b border-[#eef3f8] px-2 py-1.5 align-middle ${alignClass}`}
          >
            {column.key === "uom" ? (
              <select
                data-opening-stock-field-control="true"
                value={row.values.oslunitid ?? ""}
                onChange={(event) => onUomChange(row.id, event.target.value)}
                className={cellSelectClass}
                disabled={!currentItemDetail || uomSelectOptions.length === 0}
              >
                <option value="">{currentItemDetail ? "Select Uom" : "Select item first"}</option>
                {uomSelectOptions.map((option) => (
                  <option key={`${row.id}-uom-${option.value}`} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            ) : column.key === "taxname" ? (
              <select
                data-opening-stock-field-control="true"
                value={row.values.osltaxid ?? ""}
                onChange={(event) => onTaxChange(row.id, event.target.value)}
                className={cellSelectClass}
              >
                <option value="">None</option>
                {taxSelectOptions.map((option) => (
                  <option key={`${row.id}-tax-${option.value}`} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            ) : column.kind === "lookup" && lookupKind && lookupFieldConfig ? (
              <LookupCell
                cellKey={cellLookupKey}
                lookupKind={lookupKind}
                isOpen={isLookupOpen}
                isLoading={isLookupLoading}
                selectedId={selectedLookupId}
                selectedLabel={selectedLookupLabel}
                placeholder={column.placeholder}
                header={column.header}
                options={lookupOptions}
                searchQuery={lookupSearchQuery}
                searchInputRef={isLookupOpen ? lookupSearchInputRef : undefined}
                rootRef={(element) => lookupRootRef(cellLookupKey, element)}
                onToggle={() => onToggleLookup(cellLookupKey, lookupKind)}
                onSearchChange={(search) => {
                  setLookupSearchQuery(search);
                  onLookupSearchChange(lookupKind, search);
                }}
                onSelect={(option) => onLookupSelection(row.id, lookupKind, option)}
              />
            ) : column.kind === "select" ? (
              <select
                data-opening-stock-field-control="true"
                value={value}
                onChange={(event) => onRowChange(row.id, column.key, event.target.value)}
                className={cellSelectClass}
              >
                {(column.options ?? []).map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            ) : (
              <input
                data-opening-stock-field-control="true"
                type={column.kind === "date" ? "date" : column.kind === "number" ? "number" : "text"}
                value={value}
                onChange={(event) => onRowChange(row.id, column.key, event.target.value)}
                className={column.kind === "number" ? numericInputClass : cellInputClass}
                placeholder={column.placeholder}
              />
            )}
          </td>
        );
      })}
    </tr>
  );
}