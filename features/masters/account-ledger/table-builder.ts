import type { ReusableTableColumn } from "@/components/ui/table";
import type { GridColumnConfig } from "@/store/slices/gridColumnsSlice";
import {
  LOOKUP_KEYS,
  LEDGER_COMPANY_NAME_KEYS,
  LEDGER_BRANCH_NAME_KEYS,
  LEDGER_GROUP_NAME_KEYS,
} from "./constants";
import {
  toDisplayValue,
  getFirstDefinedValue,
  extractRows,
  normalizeColumnToken,
} from "./transformers";
import type { LedgerTableRow, LedgerColumnAccessor } from "./types";

const STYLE_ARRAY_KEYS = ["styles", "gridColumns", "grid_columns", "columns"] as const;
const STYLE_HEADER_KEYS = [
  "grid_column_name",
  "gridColumnName",
  "column_name",
  "columnName",
  "header",
  "label",
] as const;
const STYLE_ACCESSOR_KEYS = [
  "grid_column_notes",
  "gridColumnNotes",
  "accessor",
  "accessorKey",
  "field",
  "fieldName",
  "grid_column_name",
  "gridColumnName",
] as const;
const STYLE_ORDER_KEYS = ["grid_column_number", "gridColumnNumber", "order", "position"] as const;
const STYLE_VISIBLE_KEYS = ["grid_column_visibility", "gridColumnVisibility", "visible"] as const;
const STYLE_FILTER_KEYS = ["grid_column_filter", "gridColumnFilter", "sortable"] as const;
const STYLE_WIDTH_KEYS = ["grid_column_width", "gridColumnWidth", "width"] as const;
const STYLE_ALIGN_KEYS = ["grid_column_alignment", "gridColumnAlignment", "align"] as const;
const STYLE_COLOR_KEYS = ["grid_column_color", "gridColumnColor", "color"] as const;

const DEFAULT_LEDGER_SERIAL_COLUMN: ReusableTableColumn<LedgerTableRow> = {
  key: "serialNo",
  header: "S.No",
  accessor: "serialNo",
  width: "56px",
  sortable: false,
};

export const DEFAULT_LEDGER_COLUMNS: ReusableTableColumn<LedgerTableRow>[] = [
  DEFAULT_LEDGER_SERIAL_COLUMN,
  {
    key: "ledgerCode",
    header: "Ledger Code",
    accessor: "ledgerCode",
    width: "220px",
  },
  {
    key: "ledgerName",
    header: "Ledger Name",
    accessor: "ledgerName",
    width: "320px",
  },
  {
    key: "ledgerShort",
    header: "Short Name",
    accessor: "ledgerShort",
    width: "180px",
  },
  {
    key: "ledgerStatus",
    header: "Status",
    accessor: "ledgerStatus",
    width: "120px",
  },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
    return null;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "y"].includes(normalized)) {
      return true;
    }
    if (["false", "0", "no", "n"].includes(normalized)) {
      return false;
    }
  }
  return null;
}

function toOrder(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value));
  }
  if (typeof value === "string") {
    const parsed = Number.parseInt(value.trim(), 10);
    if (Number.isFinite(parsed)) {
      return Math.max(0, parsed);
    }
  }
  return fallback;
}

function toWidth(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return `${value}%`;
  }
  if (typeof value === "string") {
    const normalized = value.trim();
    if (!normalized) {
      return undefined;
    }
    if (/^\d+(\.\d+)?$/.test(normalized)) {
      return `${Number(normalized)}%`;
    }
    return normalized;
  }
  return undefined;
}

function toAlign(value: unknown): ReusableTableColumn<LedgerTableRow>["align"] | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "left" || normalized === "center" || normalized === "right") {
    return normalized;
  }
  return undefined;
}

function toColor(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim();
  return normalized || undefined;
}

function extractStyleRows(payload: unknown): Record<string, unknown>[] {
  if (!isRecord(payload)) {
    return [];
  }
  const candidates: unknown[] = [];
  for (const key of STYLE_ARRAY_KEYS) {
    candidates.push(payload[key]);
  }
  if (isRecord(payload.data)) {
    for (const key of STYLE_ARRAY_KEYS) {
      candidates.push(payload.data[key]);
    }
  }
  const styles = candidates.find(Array.isArray);
  return Array.isArray(styles) ? styles.filter(isRecord) : [];
}

function getRawValue(row: LedgerTableRow, accessorKey: string): unknown {
  if (!row.__source) {
    return "";
  }
  if (accessorKey in row.__source) {
    return row.__source[accessorKey];
  }
  const normalizedAccessor = normalizeColumnToken(accessorKey);
  const sourceKey = Object.keys(row.__source).find(
    (key) => normalizeColumnToken(key) === normalizedAccessor,
  );
  return sourceKey ? row.__source[sourceKey] : "";
}

const LEDGER_COLUMN_ACCESSOR_MAP: Record<string, LedgerColumnAccessor> = {
  sno: "serialNo",
  srno: "serialNo",
  serialno: "serialNo",
  serialnumber: "serialNo",
  code: "ledgerCode",
  ledgercode: "ledgerCode",
  ledgeralias: "ledgerCode",
  ledger_alias: "ledgerCode",
  ledalias: "ledgerCode",
  led_alias: "ledgerCode",
  alias: "ledgerCode",
  name: "ledgerName",
  ledgername: "ledgerName",
  ledgernames: "ledgerName",
  ledger_names: "ledgerName",
  ledname: "ledgerName",
  led_name: "ledgerName",
  short: "ledgerShort",
  shortname: "ledgerShort",
  ledgershort: "ledgerShort",
  ledger_short: "ledgerShort",
  ledshort: "ledgerShort",
  led_short: "ledgerShort",
  status: "ledgerStatus",
  active: "ledgerStatus",
  isactive: "ledgerStatus",
  is_active: "ledgerStatus",
  ledisactive: "ledgerStatus",
  led_is_active: "ledgerStatus",
  id: "ledgerId",
  ledgerid: "ledgerId",
  ledid: "ledgerId",
  led_id: "ledgerId",
  companyname: "companyName",
  company_name: "companyName",
  branchname: "branchName",
  branch_name: "branchName",
  groupname: "groupName",
  group_name: "groupName",
};

export function resolveLedgerAccessor(
  ...candidates: Array<string | undefined>
): LedgerColumnAccessor | null {
  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }

    const normalized = normalizeColumnToken(candidate);
    const mapped = LEDGER_COLUMN_ACCESSOR_MAP[normalized];
    if (mapped) {
      return mapped;
    }

    const compact = normalized.replace(/_/g, "");
    const compactMapped = LEDGER_COLUMN_ACCESSOR_MAP[compact];
    if (compactMapped) {
      return compactMapped;
    }
  }

  return null;
}

export function buildLedgerRows(payload: unknown, serialOffset: number): LedgerTableRow[] {
  return extractRows(payload, LOOKUP_KEYS.array).map((item, index) => {
    const serialNo = serialOffset + index + 1;
    if (item && typeof item === "object" && !Array.isArray(item)) {
      const row = item as Record<string, unknown>;
      const idValue = getFirstDefinedValue(row, LOOKUP_KEYS.id);
      const codeValue = getFirstDefinedValue(row, LOOKUP_KEYS.code);
      const nameValue = getFirstDefinedValue(row, LOOKUP_KEYS.name);
      const shortValue = getFirstDefinedValue(row, LOOKUP_KEYS.short);
      const activeValue = getFirstDefinedValue(row, LOOKUP_KEYS.active);
      const companyNameValue = getFirstDefinedValue(row, LEDGER_COMPANY_NAME_KEYS);
      const branchNameValue = getFirstDefinedValue(row, LEDGER_BRANCH_NAME_KEYS);
      const groupNameValue = getFirstDefinedValue(row, LEDGER_GROUP_NAME_KEYS);
      const preferredKey = idValue ?? row.id ?? row._id ?? row.code ?? serialNo;
      const rowId =
        typeof preferredKey === "string" || typeof preferredKey === "number"
          ? preferredKey
          : serialNo;
      return {
        __rowId: rowId,
        __recordId: rowId,
        __source: row,
        serialNo,
        ledgerId: toDisplayValue(idValue) || String(serialNo),
        ledgerCode: toDisplayValue(codeValue),
        ledgerName: toDisplayValue(nameValue),
        ledgerShort: toDisplayValue(shortValue),
        ledgerStatus: toDisplayValue(activeValue),
        companyName: toDisplayValue(companyNameValue),
        branchName: toDisplayValue(branchNameValue),
        groupName: toDisplayValue(groupNameValue),
      };
    }
    return {
      __rowId: serialNo,
      __recordId: serialNo,
      __source: null,
      serialNo,
      ledgerId: String(serialNo),
      ledgerCode: "",
      ledgerName: toDisplayValue(item),
      ledgerShort: "",
      ledgerStatus: "",
      companyName: "",
      branchName: "",
      groupName: "",
    };
  });
}

export function resolveLedgerRecordId(row: LedgerTableRow): string | number {
  if (row.__source) {
    const sourceId = getFirstDefinedValue(row.__source, LOOKUP_KEYS.id);
    if (typeof sourceId === "string" || typeof sourceId === "number") {
      return sourceId;
    }
  }
  return row.__recordId;
}

export function buildColumnsFromGridColumns(
  gridColumns: any[],
): ReusableTableColumn<LedgerTableRow>[] {
  const columns: ReusableTableColumn<LedgerTableRow>[] = [];
  const seenColumnKeys = new Set<string>();
  const visibleColumns = gridColumns
    .filter((column: any) => column.visible)
    .sort((left: any, right: any) => left.order - right.order);

  for (const gridColumn of visibleColumns) {
    const accessor = resolveLedgerAccessor(
      gridColumn.accessorKey,
      gridColumn.key,
      gridColumn.header,
    );
    if (!accessor) {
      continue;
    }
    const keyBase =
      normalizeColumnToken(
        gridColumn.key || gridColumn.accessorKey || gridColumn.header || accessor
      ) || accessor;
    const uniqueKey = seenColumnKeys.has(keyBase)
      ? `${keyBase}-${columns.length + 1}`
      : keyBase;
    seenColumnKeys.add(uniqueKey);

    const tableColumn: ReusableTableColumn<LedgerTableRow> = {
      key: uniqueKey,
      header: gridColumn.header,
      accessor,
      align: gridColumn.align ?? "left",
      width: gridColumn.width ?? (accessor === "serialNo" ? "56px" : undefined),
      sortable: gridColumn.sortable ?? accessor !== "serialNo",
      headerStyle: gridColumn.color ? { backgroundColor: gridColumn.color } : undefined,
      cellStyle: gridColumn.color ? { backgroundColor: gridColumn.color } : undefined,
    };
    columns.push(tableColumn);
  }

  if (columns.length === 0) {
    return DEFAULT_LEDGER_COLUMNS;
  }

  const serialColumnIndex = columns.findIndex((column) => column.accessor === "serialNo");
  if (serialColumnIndex < 0) {
    columns.unshift({ ...DEFAULT_LEDGER_SERIAL_COLUMN });
    return columns;
  }

  if (serialColumnIndex > 0) {
    const [serialColumn] = columns.splice(serialColumnIndex, 1);
    columns.unshift({
      ...serialColumn,
      accessor: "serialNo",
      sortable: false,
    });
  }

  return columns;
}

export function buildColumnsFromResponseStyles(
  payload: unknown,
): ReusableTableColumn<LedgerTableRow>[] {
  const styleRows = extractStyleRows(payload)
    .map((row, index) => ({ row, order: toOrder(getFirstDefinedValue(row, STYLE_ORDER_KEYS), index) }))
    .sort((left, right) => left.order - right.order);

  if (styleRows.length === 0) {
    return [];
  }

  const columns: ReusableTableColumn<LedgerTableRow>[] = [];
  const seenKeys = new Set<string>();

  for (const { row } of styleRows) {
    const isVisible = toBoolean(getFirstDefinedValue(row, STYLE_VISIBLE_KEYS));
    if (isVisible === false) {
      continue;
    }

    const header = toDisplayValue(getFirstDefinedValue(row, STYLE_HEADER_KEYS));
    if (!header) {
      continue;
    }

    const accessorKey = toDisplayValue(getFirstDefinedValue(row, STYLE_ACCESSOR_KEYS)) || header;
    const accessor = resolveLedgerAccessor(accessorKey, header);
    const keyBase = normalizeColumnToken(accessorKey || header) || `column${columns.length + 1}`;
    const uniqueKey = seenKeys.has(keyBase) ? `${keyBase}-${columns.length + 1}` : keyBase;
    seenKeys.add(uniqueKey);

    const color = toColor(getFirstDefinedValue(row, STYLE_COLOR_KEYS));
    const width = toWidth(getFirstDefinedValue(row, STYLE_WIDTH_KEYS));
    const align = toAlign(getFirstDefinedValue(row, STYLE_ALIGN_KEYS));
    const sortable = toBoolean(getFirstDefinedValue(row, STYLE_FILTER_KEYS));

    if (accessor === "serialNo") {
      columns.push({
        key: uniqueKey,
        header,
        accessor: "serialNo",
        width: width ?? "56px",
        align,
        sortable: false,
        headerStyle: color ? { backgroundColor: color } : undefined,
        cellStyle: color ? { backgroundColor: color } : undefined,
      });
      continue;
    }

    if (accessor) {
      columns.push({
        key: uniqueKey,
        header,
        accessor,
        width,
        align,
        sortable: sortable ?? true,
        headerStyle: color ? { backgroundColor: color } : undefined,
        cellStyle: color ? { backgroundColor: color } : undefined,
      });
      continue;
    }

    columns.push({
      key: uniqueKey,
      header,
      width,
      align,
      sortable: sortable ?? true,
      render: (ledgerRow) => toDisplayValue(getRawValue(ledgerRow, accessorKey)),
      searchAccessor: (ledgerRow) => getRawValue(ledgerRow, accessorKey),
      sortAccessor: (ledgerRow) => getRawValue(ledgerRow, accessorKey),
      headerStyle: color ? { backgroundColor: color } : undefined,
      cellStyle: color ? { backgroundColor: color } : undefined,
    });
  }

  if (columns.length === 0) {
    return [{ ...DEFAULT_LEDGER_SERIAL_COLUMN }];
  }

  if (!columns.some((column) => column.accessor === "serialNo")) {
    columns.unshift({ ...DEFAULT_LEDGER_SERIAL_COLUMN });
  }

  return columns;
}

export function resolveGridColumnForLedgerTableColumn(
  tableColumn: ReusableTableColumn<LedgerTableRow>,
  gridColumns: GridColumnConfig[],
): GridColumnConfig | null {
  const tableTokens = [
    tableColumn.key,
    typeof tableColumn.accessor === "string" ? tableColumn.accessor : "",
    typeof tableColumn.header === "string" ? tableColumn.header : "",
  ]
    .map(normalizeColumnToken)
    .filter(Boolean);

  if (tableTokens.length === 0) {
    return null;
  }

  return (
    gridColumns.find((gridColumn) => {
      const gridTokens = [
        gridColumn.key,
        gridColumn.accessorKey,
        gridColumn.header,
        gridColumn.columnName ?? "",
      ]
        .map(normalizeColumnToken)
        .filter(Boolean);
      return tableTokens.some((token) => gridTokens.includes(token));
    }) ?? null
  );
}
