import type { ERPDynamicSelectOption } from "@/components/design-system/ui";

export type ColumnAlign = "left" | "center" | "right";
export type ColumnKind = "text" | "number" | "date" | "select" | "lookup";
export type LookupKind = "item" | "godown" | "batch" | "reason";
export type LookupCellState = {
  key: string;
  kind: LookupKind;
};

// A lookup option enriched with a secondary "code" (item code / godown search
// code) so the lookup dropdown can render the legacy tabular layout. `code` is
// optional, so a `StockLookupOption` is interchangeable with a plain option
// wherever only `label`/`value` are consumed.
export type StockLookupOption = ERPDynamicSelectOption & { code?: string };

// Describes one data column in a tabular lookup dropdown. The serial (S.No)
// column is always rendered by the cell itself and is not listed here.
export type LookupTableColumn = {
  key: "code" | "label";
  header: string;
  // CSS grid track size for this column (e.g. "120px" or "minmax(0, 1fr)").
  width: string;
};

// Shared between opening-stock and physical-stock
export type UiTableColumnPayload = {
  uiTblClmId?: string;
  uiTblClmNo?: string;
  uiTblClmTableId?: string | null;
  uiTblClmName: string | null;
  uiTblClmColumnWidth: number | null;
  uiTblClmColumnVisibility: boolean | null;
  uiTblClmColumnFocus?: boolean | null;
  uiTblClmColumnPosition: number | null;
  uiTblClmColumnNecessity?: boolean | null;
  uiTblClmNextColumn?: number | null;
  uiTblClmPreviousColumn?: number | null;
  uiTblClmIsActive?: boolean | null;
};

export type SaveUiTableColumnRequest = {
  uiTblClmId?: string;
  uiTblClmNo?: string;
  uiTblClmName: string;
  uiTblClmTableId: string | null;
  uiTblClmColumnWidth: number | null;
  uiTblClmColumnVisibility: boolean;
  uiTblClmColumnFocus: boolean;
  uiTblClmColumnPosition: number;
  uiTblClmColumnNecessity: boolean;
  uiTblClmNextColumn: number | null;
  uiTblClmPreviousColumn: number | null;
  uiTblClmIsActive: boolean;
};

export type SaveUiTableMasterRequest = {
  uiTblId: string;
  uiTblColumns: SaveUiTableColumnRequest[];
};

export type UiTableMasterResponse = {
  uiTblId: string;
  uiTblName: string;
  columns: UiTableColumnPayload[];
};

export type StockListMeta = {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
};

export type StockListFilters = {
  search: string;
  dateFrom: string;
  dateTo: string;
};
