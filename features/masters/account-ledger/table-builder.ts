import type { ReusableTableColumn } from "@/components/ui/table";
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
