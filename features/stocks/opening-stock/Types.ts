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

export type OpeningStockRow = {
  id: number;
  values: Record<string, string>;
};

export type RowValidationIssue = {
  fieldKey: string;
  message: string;
};

export type AccountLedgerRecord = {
  ledId: string;
  ledName: string;
};

export type GodownLookupRecord = {
  gdl_id?: string | null;
  gdl_name?: string | null;
  gdl_branch_id?: string | null;
};

export type LoadedOpeningStockMeta = {
  voucherId: string;
  voucherLabel: string;
  voucherDate: string;
  companyId: string;
  branchId: string;
};

export type LookupCellState = {
  key: string;
  kind: LookupKind;
};
