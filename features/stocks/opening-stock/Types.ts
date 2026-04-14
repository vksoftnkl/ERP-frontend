// ─── Column / Table types ────────────────────────────────────────────────────

export type ColumnAlign = "left" | "center" | "right";
export type ColumnKind = "text" | "number" | "date" | "select" | "lookup";
export type LookupKind = "item" | "godown";

export type UiTableColumnPayload = {
  uiTblClmNo?: string;
  uiTblClmName: string | null;
  uiTblClmColumnWidth: number | null;
  uiTblClmColumnVisibility: boolean | null;
  uiTblClmColumnPosition: number | null;
};

export type ColumnSchema = {
  header: string;
  defaultWidth: string;
  align: ColumnAlign;
  kind: ColumnKind;
  lookupKind?: LookupKind;
  placeholder?: string;
  options?: readonly string[];
  defaultValue?: string;
};

export type ColumnDefinition = ColumnSchema & {
  key: string;
  width: string;
};

// ─── Row types ───────────────────────────────────────────────────────────────

export type OpeningStockRow = {
  id: number;
  values: Record<string, string>;
};

// ─── Internal metadata ───────────────────────────────────────────────────────

export type AccountLedgerRecord = {
  ledId: string;
  ledName: string;
};

export type LoadedOpeningStockMeta = {
  voucherId: string;
  voucherLabel: string;
  voucherDate: string;
  companyId: string;
  branchId: string;
};

// ─── Navigation types ────────────────────────────────────────────────────────

export type TableFieldNavigationDirection = "left" | "right" | "up" | "down";

export type TableFocusableFieldTarget = {
  fieldKey: string;
  rowIndex: number;
  columnIndex: number;
  container: HTMLElement;
  control: HTMLElement;
};