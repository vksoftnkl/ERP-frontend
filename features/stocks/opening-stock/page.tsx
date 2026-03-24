"use client";
import { type CSSProperties, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FiChevronDown, FiPlus, FiSearch, FiTrash2 } from "react-icons/fi";
import type { ERPDynamicSelectOption } from "@/components/library/ui";
import { buildLookupOptions, DEFAULT_LOOKUP_ARRAY_KEYS } from "@/features/masters/shared/normalizers";
import tableStyles from "@/components/ui/table.module.scss";
import { useApi } from "@/hooks/useApi";
import type { ApiSuccessResponse, ListMeta } from "@/utils/types";
import styles from "./page.module.scss";
type ColumnAlign = "left" | "center" | "right";
type ColumnKind = "text" | "number" | "date" | "select" | "lookup";
type LookupKind = "item" | "godown";
type UiTableColumnPayload = {
  uiTblClmNo?: string;
  uiTblClmName: string | null;
  uiTblClmColumnWidth: number | null;
  uiTblClmColumnVisibility: boolean | null;
  uiTblClmColumnPosition: number | null;
};
type ColumnSchema = {
  header: string;
  defaultWidth: string;
  align: ColumnAlign;
  kind: ColumnKind;
  lookupKind?: LookupKind;
  placeholder?: string;
  options?: readonly string[];
  step?: string;
  defaultValue?: string;
};
type ColumnDefinition = ColumnSchema & {
  key: string;
  width: string;
};
type OpeningStockRow = {
  id: number;
  values: Record<string, string>;
};
const UI_TABLE_COLUMNS_LIST_ENDPOINT = "/ui-table-columns/list";
const MASTER_LOOKUP_ENDPOINT = "/master-lookups/name-id/all-accounts-and-masters";
const ITEM_LIST_ENDPOINT = "/items/list";
const UI_TABLE_COLUMNS_QUERY = {
  uiTblClmTableId: "5",
  page: "1",
  limit: "100",
} as const;
const UI_TABLE_COLUMNS_TOAST_OPTIONS = {
  success: false,
  error: false,
} as const;
const MASTER_LOOKUP_TOAST_OPTIONS = {
  success: false,
  error: false,
} as const;
const LOOKUP_SEARCH_DEBOUNCE_MS = 250;
const SERIAL_NUMBER_COLUMN_WIDTH = "76px";
const ACTION_COLUMN_WIDTH = "90px";
const TRACKING_OPTIONS = ["NONE", "BATCH", "LOT"] as const;
const PROFIT_TYPE_OPTIONS = ["PERCENT", "VALUE"] as const;
const CESS_TYPE_OPTIONS = ["NONE", "PERCENT", "PER_UNIT"] as const;
const ITEM_LOOKUP_QUERY = {
  limit: "50",
} as const;
const GODOWN_LOOKUP_QUERY = {
  module: "godownLocations",
  limit: "100",
} as const;
const DEFAULT_ITEM_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "Clear selection",
};
const DEFAULT_GODOWN_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "Clear selection",
};
const ITEM_LOOKUP_KEYS = {
  arrayKeys: [...DEFAULT_LOOKUP_ARRAY_KEYS, "item_masters", "items"],
  idKeys: ["item_id", "itemId", "id", "_id", "value"],
  labelKeys: ["item_name_en", "itemNameEn", "name", "label"],
} as const;
const GODOWN_LOOKUP_KEYS = {
  arrayKeys: [...DEFAULT_LOOKUP_ARRAY_KEYS, "godowns", "godown_locations"],
  idKeys: [
    "gdl_id",
    "gdlId",
    "gdl_location_id",
    "godown_id",
    "godownId",
    "id",
    "_id",
    "value",
  ],
  labelKeys: [
    "gdl_name",
    "gdlName",
    "godown_name",
    "godownName",
    "name",
    "label",
  ],
} as const;
const LOOKUP_FIELD_CONFIG: Record<
  LookupKind,
  {
    labelField: string;
    idField: string;
    emptyMessage: string;
  }
> = {
  item: {
    labelField: "itemname",
    idField: "oslitemid",
    emptyMessage: "No items found.",
  },
  godown: {
    labelField: "godown",
    idField: "oslgodownid",
    emptyMessage: "No godowns found.",
  },
};
const COLUMN_SCHEMA: Record<string, ColumnSchema> = {
  barcode: {
    header: "Barcode",
    defaultWidth: "100px",
    align: "left",
    kind: "text",
    placeholder: "Barcode",
  },
  code: {
    header: "Code",
    defaultWidth: "100px",
    align: "left",
    kind: "text",
    placeholder: "Item code",
  },
  itemname: {
    header: "Item Name",
    defaultWidth: "220px",
    align: "left",
    kind: "lookup",
    lookupKind: "item",
    placeholder: "Search item",
  },
  godown: {
    header: "Godown",
    defaultWidth: "150px",
    align: "left",
    kind: "lookup",
    lookupKind: "godown",
    placeholder: "Search godown",
  },
  uom: {
    header: "Uom",
    defaultWidth: "100px",
    align: "left",
    kind: "text",
    placeholder: "Uom",
  },
  taxname: {
    header: "Tax Name",
    defaultWidth: "120px",
    align: "left",
    kind: "text",
    placeholder: "Tax name",
  },
  openingqty: {
    header: "Opening Qty",
    defaultWidth: "110px",
    align: "right",
    kind: "number",
    placeholder: "0.000",
    step: "0.001",
    defaultValue: "0.000",
  },
  freeqty: {
    header: "Free Qty",
    defaultWidth: "100px",
    align: "right",
    kind: "number",
    placeholder: "0.000",
    step: "0.001",
    defaultValue: "0.000",
  },
  baseqty: {
    header: "Base Qty",
    defaultWidth: "100px",
    align: "right",
    kind: "number",
    placeholder: "0.000",
    step: "0.001",
    defaultValue: "0.000",
  },
  convfactor: {
    header: "Conv Factor",
    defaultWidth: "110px",
    align: "right",
    kind: "number",
    placeholder: "1.000",
    step: "0.001",
    defaultValue: "1.000",
  },
  batchno: {
    header: "Batch No",
    defaultWidth: "120px",
    align: "left",
    kind: "text",
    placeholder: "Batch no",
  },
  serialno: {
    header: "Serial No",
    defaultWidth: "120px",
    align: "left",
    kind: "text",
    placeholder: "Serial no",
  },
  batchdate: {
    header: "Batch Date",
    defaultWidth: "120px",
    align: "left",
    kind: "date",
  },
  mfgdate: {
    header: "Mfg Date",
    defaultWidth: "120px",
    align: "left",
    kind: "date",
  },
  expirydate: {
    header: "Expiry Date",
    defaultWidth: "120px",
    align: "left",
    kind: "date",
  },
  costprice: {
    header: "Cost Price",
    defaultWidth: "110px",
    align: "right",
    kind: "number",
    placeholder: "0.00",
    step: "0.01",
    defaultValue: "0.00",
  },
  costwot: {
    header: "Cost Wot",
    defaultWidth: "110px",
    align: "right",
    kind: "number",
    placeholder: "0.00",
    step: "0.01",
    defaultValue: "0.00",
  },
  profittype: {
    header: "Profit Type",
    defaultWidth: "110px",
    align: "left",
    kind: "select",
    options: PROFIT_TYPE_OPTIONS,
    defaultValue: PROFIT_TYPE_OPTIONS[0],
  },
  roundoff: {
    header: "Round Off",
    defaultWidth: "100px",
    align: "right",
    kind: "number",
    placeholder: "0.00",
    step: "0.01",
    defaultValue: "0.00",
  },
  priceawot: {
    header: "Price A Wot",
    defaultWidth: "110px",
    align: "right",
    kind: "number",
    placeholder: "0.00",
    step: "0.01",
    defaultValue: "0.00",
  },
  priceamarkup: {
    header: "Price A Markup",
    defaultWidth: "120px",
    align: "right",
    kind: "number",
    placeholder: "0.00",
    step: "0.01",
    defaultValue: "0.00",
  },
  pricea: {
    header: "Price A",
    defaultWidth: "110px",
    align: "right",
    kind: "number",
    placeholder: "0.00",
    step: "0.01",
    defaultValue: "0.00",
  },
  pricebwot: {
    header: "Price B Wot",
    defaultWidth: "110px",
    align: "right",
    kind: "number",
    placeholder: "0.00",
    step: "0.01",
    defaultValue: "0.00",
  },
  pricebmarkup: {
    header: "Price B Markup",
    defaultWidth: "120px",
    align: "right",
    kind: "number",
    placeholder: "0.00",
    step: "0.01",
    defaultValue: "0.00",
  },
  priceb: {
    header: "Price B",
    defaultWidth: "110px",
    align: "right",
    kind: "number",
    placeholder: "0.00",
    step: "0.01",
    defaultValue: "0.00",
  },
  pricecwot: {
    header: "Price C Wot",
    defaultWidth: "110px",
    align: "right",
    kind: "number",
    placeholder: "0.00",
    step: "0.01",
    defaultValue: "0.00",
  },
  pricecmarkup: {
    header: "Price C Markup",
    defaultWidth: "120px",
    align: "right",
    kind: "number",
    placeholder: "0.00",
    step: "0.01",
    defaultValue: "0.00",
  },
  pricec: {
    header: "Price C",
    defaultWidth: "110px",
    align: "right",
    kind: "number",
    placeholder: "0.00",
    step: "0.01",
    defaultValue: "0.00",
  },
  pricedwot: {
    header: "Price D Wot",
    defaultWidth: "110px",
    align: "right",
    kind: "number",
    placeholder: "0.00",
    step: "0.01",
    defaultValue: "0.00",
  },
  pricedmarkup: {
    header: "Price D Markup",
    defaultWidth: "120px",
    align: "right",
    kind: "number",
    placeholder: "0.00",
    step: "0.01",
    defaultValue: "0.00",
  },
  priced: {
    header: "Price D",
    defaultWidth: "110px",
    align: "right",
    kind: "number",
    placeholder: "0.00",
    step: "0.01",
    defaultValue: "0.00",
  },
  mrp: {
    header: "M.R.P",
    defaultWidth: "100px",
    align: "right",
    kind: "number",
    placeholder: "0.00",
    step: "0.01",
    defaultValue: "0.00",
  },
  msp: {
    header: "M.S.P",
    defaultWidth: "100px",
    align: "right",
    kind: "number",
    placeholder: "0.00",
    step: "0.01",
    defaultValue: "0.00",
  },
  remarks: {
    header: "Remarks",
    defaultWidth: "220px",
    align: "left",
    kind: "text",
    placeholder: "Remarks",
  },
  oslitemid: {
    header: "osl item id",
    defaultWidth: "120px",
    align: "left",
    kind: "text",
    placeholder: "Item id",
  },
  oslunitid: {
    header: "osl unit id",
    defaultWidth: "120px",
    align: "left",
    kind: "text",
    placeholder: "Unit id",
  },
  oslbaseuomid: {
    header: "osl base uom id",
    defaultWidth: "130px",
    align: "left",
    kind: "text",
    placeholder: "Base uom id",
  },
  oslgodownid: {
    header: "osl godown id",
    defaultWidth: "130px",
    align: "left",
    kind: "text",
    placeholder: "Godown id",
  },
  osltrackingtype: {
    header: "osl tracking type",
    defaultWidth: "130px",
    align: "left",
    kind: "select",
    options: TRACKING_OPTIONS,
    defaultValue: TRACKING_OPTIONS[0],
  },
  osltaxid: {
    header: "osl tax id",
    defaultWidth: "110px",
    align: "left",
    kind: "text",
    placeholder: "Tax id",
  },
  osltaxperc: {
    header: "osl tax perc",
    defaultWidth: "110px",
    align: "right",
    kind: "number",
    placeholder: "0.000",
    step: "0.001",
    defaultValue: "0.000",
  },
  oslcesstype: {
    header: "osl cess type",
    defaultWidth: "120px",
    align: "left",
    kind: "select",
    options: CESS_TYPE_OPTIONS,
    defaultValue: CESS_TYPE_OPTIONS[0],
  },
  oslcessperc: {
    header: "osl cess perc",
    defaultWidth: "110px",
    align: "right",
    kind: "number",
    placeholder: "0.000",
    step: "0.001",
    defaultValue: "0.000",
  },
  oslcessperunit: {
    header: "osl cess per unit",
    defaultWidth: "120px",
    align: "right",
    kind: "number",
    placeholder: "0.00",
    step: "0.01",
    defaultValue: "0.00",
  },
};
const FALLBACK_COLUMN_KEYS = [
  "barcode",
  "code",
  "itemname",
  "godown",
  "uom",
  "taxname",
  "openingqty",
  "freeqty",
  "baseqty",
  "convfactor",
  "batchno",
  "serialno",
  "costprice",
  "pricea",
  "mrp",
  "remarks",
] as const;
const QUANTITY_FORMATTER = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 3,
  maximumFractionDigits: 3,
});
const VALUE_FORMATTER = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
function cx(...tokens: Array<string | false | undefined>): string {
  return tokens.filter(Boolean).join(" ");
}
function normalizeColumnName(value: string): string {
  return value.replace(/[^a-zA-Z0-9]+/g, "").toLowerCase();
}
function parseDecimal(value: string | undefined): number {
  const parsed = Number.parseFloat(value ?? "");
  return Number.isFinite(parsed) ? parsed : 0;
}
function toColumnWidth(value: number | null | undefined, fallback: string): string {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return `${value}px`;
}
function getAlignClass(align: ColumnAlign): string {
  if (align === "right") {
    return tableStyles.alignRight;
  }
  if (align === "center") {
    return tableStyles.alignCenter;
  }
  return tableStyles.alignLeft;
}
function createUnknownColumnSchema(header: string): ColumnSchema {
  return {
    header,
    defaultWidth: "120px",
    align: "left",
    kind: "text",
    placeholder: header,
  };
}
function createFallbackColumns(): ColumnDefinition[] {
  return FALLBACK_COLUMN_KEYS.map((key) => {
    const schema = COLUMN_SCHEMA[key];
    return {
      key,
      header: schema.header,
      width: schema.defaultWidth,
      align: schema.align,
      kind: schema.kind,
      lookupKind: schema.lookupKind,
      placeholder: schema.placeholder,
      options: schema.options,
      step: schema.step,
      defaultValue: schema.defaultValue,
      defaultWidth: schema.defaultWidth,
    };
  });
}
function createDefaultRowValues(): Record<string, string> {
  return Object.entries(COLUMN_SCHEMA).reduce<Record<string, string>>((accumulator, [key, schema]) => {
    accumulator[key] = schema.defaultValue ?? "";
    return accumulator;
  }, {});
}
function createRow(id: number, overrides: Record<string, string> = {}): OpeningStockRow {
  return {
    id,
    values: {
      ...createDefaultRowValues(),
      ...overrides,
    },
  };
}
const INITIAL_ROWS: OpeningStockRow[] = [createRow(1)];
function createEmptyRow(nextId: number): OpeningStockRow {
  return createRow(nextId);
}
function getNextRowId(rows: OpeningStockRow[]): number {
  return rows.reduce((highestId, row) => Math.max(highestId, row.id), 0) + 1;
}
function getFilteredRows(rows: OpeningStockRow[], searchQuery: string): OpeningStockRow[] {
  const normalizedQuery = searchQuery.trim().toLowerCase();
  if (!normalizedQuery) {
    return rows;
  }
  return rows.filter((row) =>
    Object.values(row.values).some((value) => value.toLowerCase().includes(normalizedQuery)),
  );
}
function getRowStockValue(row: OpeningStockRow): number {
  return parseDecimal(row.values.openingqty) * parseDecimal(row.values.costprice);
}
function getTotals(rows: OpeningStockRow[]): {
  lines: number;
  qty: number;
  freeQty: number;
  value: number;
} {
  return rows.reduce(
    (accumulator, row) => ({
      lines: accumulator.lines + 1,
      qty: accumulator.qty + parseDecimal(row.values.openingqty),
      freeQty: accumulator.freeQty + parseDecimal(row.values.freeqty),
      value: accumulator.value + getRowStockValue(row),
    }),
    { lines: 0, qty: 0, freeQty: 0, value: 0 },
  );
}
function resolveConfiguredColumns(configuredColumns: UiTableColumnPayload[]): ColumnDefinition[] {
  if (configuredColumns.length === 0) {
    return createFallbackColumns();
  }
  const visibleColumns = [...configuredColumns]
    .filter((column) => column.uiTblClmColumnVisibility !== false)
    .sort((left, right) => {
      const leftPosition = left.uiTblClmColumnPosition ?? Number.MAX_SAFE_INTEGER;
      const rightPosition = right.uiTblClmColumnPosition ?? Number.MAX_SAFE_INTEGER;
      if (leftPosition !== rightPosition) {
        return leftPosition - rightPosition;
      }
      const leftNo = Number(left.uiTblClmNo ?? "");
      const rightNo = Number(right.uiTblClmNo ?? "");
      if (Number.isFinite(leftNo) && Number.isFinite(rightNo) && leftNo !== rightNo) {
        return leftNo - rightNo;
      }
      return 0;
    });
  const seenKeys = new Set<string>();
  const resolvedColumns: ColumnDefinition[] = [];
  for (const configuredColumn of visibleColumns) {
    const header = configuredColumn.uiTblClmName?.trim() ?? "";
    if (!header) {
      continue;
    }
    const key = normalizeColumnName(header);
    if (!key || seenKeys.has(key)) {
      continue;
    }
    const schema = COLUMN_SCHEMA[key] ?? createUnknownColumnSchema(header);
    resolvedColumns.push({
      key,
      header,
      width: toColumnWidth(configuredColumn.uiTblClmColumnWidth, schema.defaultWidth),
      align: schema.align,
      kind: schema.kind,
      lookupKind: schema.lookupKind,
      placeholder: schema.placeholder,
      options: schema.options,
      step: schema.step,
      defaultValue: schema.defaultValue,
      defaultWidth: schema.defaultWidth,
    });
    seenKeys.add(key);
  }
  return resolvedColumns.length > 0 ? resolvedColumns : createFallbackColumns();
}
function getTableMinWidth(columns: ColumnDefinition[]): string {
  const width = columns.reduce(
    (total, column) => total + parseDecimal(column.width),
    parseDecimal(SERIAL_NUMBER_COLUMN_WIDTH) + parseDecimal(ACTION_COLUMN_WIDTH),
  );
  return `${Math.max(width, 1080)}px`;
}
function mergeLookupOptions(
  currentOptions: ERPDynamicSelectOption[],
  nextOptions: ERPDynamicSelectOption[],
): ERPDynamicSelectOption[] {
  const emptyOption =
    currentOptions.find((option) => option.value === "") ??
    nextOptions.find((option) => option.value === "");
  const merged = new Map<string, string>();
  for (const option of [...currentOptions, ...nextOptions]) {
    if (!option.value) {
      continue;
    }
    if (!merged.has(option.value)) {
      merged.set(option.value, option.label);
    }
  }
  const normalizedOptions = Array.from(merged, ([value, label]) => ({ value, label })).sort(
    (left, right) => left.label.localeCompare(right.label),
  );
  return emptyOption ? [emptyOption, ...normalizedOptions] : normalizedOptions;
}
function filterLookupOptions(
  options: ERPDynamicSelectOption[],
  searchQuery: string,
): ERPDynamicSelectOption[] {
  const normalizedQuery = searchQuery.trim().toLowerCase();
  return options.filter((option) => {
    if (!option.value.trim()) {
      return false;
    }
    if (!normalizedQuery) {
      return true;
    }
    return (
      option.label.toLowerCase().includes(normalizedQuery) ||
      option.value.toLowerCase().includes(normalizedQuery)
    );
  });
}
function SummaryCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}): ReactNode {
  return (
    <article className={styles.summaryCard}>
      <span className={styles.summaryLabel}>{label}</span>
      <strong className={styles.summaryValue}>{value}</strong>
      <span className={styles.summaryHint}>{hint}</span>
    </article>
  );
}
export default function OpeningStockPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [rows, setRows] = useState<OpeningStockRow[]>(INITIAL_ROWS);
  const [uiColumnConfigs, setUiColumnConfigs] = useState<UiTableColumnPayload[]>([]);
  const [itemOptions, setItemOptions] = useState<ERPDynamicSelectOption[]>([DEFAULT_ITEM_OPTION]);
  const [godownOptions, setGodownOptions] = useState<ERPDynamicSelectOption[]>([
    DEFAULT_GODOWN_OPTION,
  ]);
  const [openLookupCell, setOpenLookupCell] = useState<{
    key: string;
    kind: LookupKind;
  } | null>(null);
  const [lookupSearchQuery, setLookupSearchQuery] = useState("");
  const lookupRootRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const lookupSearchInputRef = useRef<HTMLInputElement | null>(null);
  const itemSearchTimeoutRef = useRef<number | null>(null);
  const itemSearchRequestRef = useRef(0);
  const godownSearchTimeoutRef = useRef<number | null>(null);
  const godownSearchRequestRef = useRef(0);
  const { getAll: listUiTableColumns, loading: isConfigLoading, error: configError } = useApi<
    ApiSuccessResponse<UiTableColumnPayload[], ListMeta>
  >(UI_TABLE_COLUMNS_LIST_ENDPOINT, {
    toast: UI_TABLE_COLUMNS_TOAST_OPTIONS,
  });
  const { getAll: getItemList, loading: isItemLookupLoading } = useApi<unknown>(
    ITEM_LIST_ENDPOINT,
    {
      toast: MASTER_LOOKUP_TOAST_OPTIONS,
    },
  );
  const { getAll: getGodownLookup, loading: isGodownLookupLoading } = useApi<unknown>(
    MASTER_LOOKUP_ENDPOINT,
    {
      toast: MASTER_LOOKUP_TOAST_OPTIONS,
    },
  );
  const loadLookupOptions = useCallback(
    async (lookupKind: LookupKind, search = ""): Promise<ERPDynamicSelectOption[]> => {
      const normalizedSearch = search.trim();
      const query =
        lookupKind === "item"
          ? normalizedSearch
            ? { ...ITEM_LOOKUP_QUERY, search: normalizedSearch }
            : ITEM_LOOKUP_QUERY
          : normalizedSearch
            ? { ...GODOWN_LOOKUP_QUERY, search: normalizedSearch }
            : GODOWN_LOOKUP_QUERY;
      const payload =
        lookupKind === "item" ? await getItemList(query) : await getGodownLookup(query);
      return lookupKind === "item"
        ? buildLookupOptions(payload, DEFAULT_ITEM_OPTION, ITEM_LOOKUP_KEYS)
        : buildLookupOptions(payload, DEFAULT_GODOWN_OPTION, GODOWN_LOOKUP_KEYS);
    },
    [getGodownLookup, getItemList],
  );
  useEffect(() => {
    let cancelled = false;
    const loadUiColumnConfig = async () => {
      try {
        const payload = await listUiTableColumns({ ...UI_TABLE_COLUMNS_QUERY });
        if (!cancelled) {
          setUiColumnConfigs(Array.isArray(payload?.data) ? payload.data : []);
        }
      } catch {
        if (!cancelled) {
          setUiColumnConfigs([]);
        }
      }
    };
    void loadUiColumnConfig();
    return () => {
      cancelled = true;
    };
  }, [listUiTableColumns]);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [itemsPayload, godownsPayload] = await Promise.allSettled([
        loadLookupOptions("item"),
        loadLookupOptions("godown"),
      ]);
      if (cancelled) {
        return;
      }
      if (itemsPayload.status === "fulfilled") {
        setItemOptions(itemsPayload.value);
      }
      if (godownsPayload.status === "fulfilled") {
        setGodownOptions(godownsPayload.value);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadLookupOptions]);
  useEffect(() => {
    if (!openLookupCell) {
      return;
    }
    const animationFrame = window.requestAnimationFrame(() => {
      lookupSearchInputRef.current?.focus();
    });
    return () => {
      window.cancelAnimationFrame(animationFrame);
    };
  }, [openLookupCell]);
  useEffect(() => {
    if (!openLookupCell) {
      return;
    }
    const handlePointerDown = (event: MouseEvent) => {
      const rootElement = lookupRootRefs.current[openLookupCell.key];
      if (rootElement && !rootElement.contains(event.target as Node)) {
        setOpenLookupCell(null);
        setLookupSearchQuery("");
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenLookupCell(null);
        setLookupSearchQuery("");
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [openLookupCell]);
  useEffect(() => {
    return () => {
      if (itemSearchTimeoutRef.current !== null) {
        window.clearTimeout(itemSearchTimeoutRef.current);
      }
      if (godownSearchTimeoutRef.current !== null) {
        window.clearTimeout(godownSearchTimeoutRef.current);
      }
    };
  }, []);
  const columns = resolveConfiguredColumns(uiColumnConfigs);
  const filteredRows = getFilteredRows(rows, searchQuery);
  const visibleTotals = getTotals(filteredRows);
  const trackingRows = filteredRows.filter((row) => row.values.osltrackingtype !== "NONE").length;
  const configStatusText = isConfigLoading
    ? "Loading column config..."
    : uiColumnConfigs.length > 0
      ? `Using ${columns.length} visible columns from UI table 5`
      : configError
        ? "Column config unavailable. Using fallback columns."
        : "Using fallback columns.";
  const handleRowChange = (rowId: number, field: string, value: string) => {
    setRows((currentRows) =>
      currentRows.map((row) =>
        row.id === rowId
          ? {
              ...row,
              values: {
                ...row.values,
                [field]: value,
              },
            }
          : row,
      ),
    );
  };
  const handleLookupSelection = useCallback(
    (rowId: number, lookupKind: LookupKind, option: ERPDynamicSelectOption) => {
      const fieldConfig = LOOKUP_FIELD_CONFIG[lookupKind];
      setRows((currentRows) =>
        currentRows.map((row) =>
          row.id === rowId
            ? {
                ...row,
                values: {
                  ...row.values,
                  [fieldConfig.labelField]: option.value ? option.label : "",
                  [fieldConfig.idField]: option.value,
                },
              }
            : row,
        ),
      );
      setOpenLookupCell(null);
      setLookupSearchQuery("");
    },
    [],
  );
  const handleLookupSearchChange = useCallback(
    (lookupKind: LookupKind, search: string) => {
      const normalizedSearch = search.trim();
      if (lookupKind === "item") {
        if (itemSearchTimeoutRef.current !== null) {
          window.clearTimeout(itemSearchTimeoutRef.current);
        }
        if (!normalizedSearch) {
          return;
        }
        const requestId = itemSearchRequestRef.current + 1;
        itemSearchRequestRef.current = requestId;
        itemSearchTimeoutRef.current = window.setTimeout(() => {
          void (async () => {
            try {
              const searchedOptions = await loadLookupOptions("item", normalizedSearch);
              if (itemSearchRequestRef.current !== requestId) {
                return;
              }
              setItemOptions((currentOptions) => mergeLookupOptions(currentOptions, searchedOptions));
            } catch {
              // Keep existing options when live item lookup search fails.
            }
          })();
        }, LOOKUP_SEARCH_DEBOUNCE_MS);
        return;
      }
      if (godownSearchTimeoutRef.current !== null) {
        window.clearTimeout(godownSearchTimeoutRef.current);
      }
      if (!normalizedSearch) {
        return;
      }
      const requestId = godownSearchRequestRef.current + 1;
      godownSearchRequestRef.current = requestId;
      godownSearchTimeoutRef.current = window.setTimeout(() => {
        void (async () => {
          try {
            const searchedOptions = await loadLookupOptions("godown", normalizedSearch);
            if (godownSearchRequestRef.current !== requestId) {
              return;
            }
            setGodownOptions((currentOptions) => mergeLookupOptions(currentOptions, searchedOptions));
          } catch {
            // Keep existing options when live godown lookup search fails.
          }
        })();
      }, LOOKUP_SEARCH_DEBOUNCE_MS);
    },
    [loadLookupOptions],
  );
  const handleAddRow = () => {
    setRows((currentRows) => [...currentRows, createEmptyRow(getNextRowId(currentRows))]);
  };
  const handleRemoveRow = (rowId: number) => {
    setRows((currentRows) => {
      const nextRows = currentRows.filter((row) => row.id !== rowId);
      return nextRows.length > 0 ? nextRows : [createEmptyRow(1)];
    });
  };
  const tableMinWidth = getTableMinWidth(columns);
  const itemOptionsByValue = useMemo(
    () => new Map(itemOptions.map((option) => [option.value, option.label])),
    [itemOptions],
  );
  const godownOptionsByValue = useMemo(
    () => new Map(godownOptions.map((option) => [option.value, option.label])),
    [godownOptions],
  );
  const filteredItemOptions = useMemo(
    () => filterLookupOptions(itemOptions, lookupSearchQuery),
    [itemOptions, lookupSearchQuery],
  );
  const filteredGodownOptions = useMemo(
    () => filterLookupOptions(godownOptions, lookupSearchQuery),
    [godownOptions, lookupSearchQuery],
  );
  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headingBlock}>
                  <div className={styles.headingRow}>
            <div>
              <h1 className={styles.title}>Opening Stock</h1>
            </div>          
          </div>
        </div>
        <div className={styles.summaryGrid}>
          <SummaryCard
            label="Visible Lines"
            value={String(visibleTotals.lines)}
            hint={`${rows.length} total rows in draft`}
          />
          <SummaryCard
            label="Visible Qty"
            value={QUANTITY_FORMATTER.format(visibleTotals.qty)}
            hint={`${QUANTITY_FORMATTER.format(visibleTotals.freeQty)} free quantity`}
          />
          <SummaryCard
            label="Visible Value"
            value={VALUE_FORMATTER.format(visibleTotals.value)}
            hint="Opening qty x cost price"
          />
          <SummaryCard
            label="Tracked Rows"
            value={String(trackingRows)}
            hint="Rows with tracking enabled"
          />
        </div>
      </header>
      <div className={cx(tableStyles.tableShell, styles.tableShell)}>
        <div className={tableStyles.toolbar}>         
          <div className={tableStyles.tableTools}>
            <div className={tableStyles.searchField}>
              <FiSearch className={tableStyles.searchIcon} aria-hidden="true" />
              <input
                type="text"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search visible stock values"
                className={tableStyles.searchInput}
                autoComplete="off"
              />
            </div>
            <button type="button" className={tableStyles.createButton} onClick={handleAddRow}>
              <FiPlus className={tableStyles.createIcon} aria-hidden="true" />
              <span>Add line</span>
            </button>
          </div>
        </div>
        <div className={tableStyles.tableViewport} data-erp-table-viewport="true">
          <table
            className={tableStyles.table}
            style={{ "--erp-table-min-width": tableMinWidth } as CSSProperties}
          >
            <colgroup>
              <col style={{ width: SERIAL_NUMBER_COLUMN_WIDTH }} />
              {columns.map((column) => (
                <col key={column.key} style={{ width: column.width }} />
              ))}
              <col style={{ width: ACTION_COLUMN_WIDTH }} />
            </colgroup>
            <thead className={tableStyles.head}>
              <tr>
                <th
                  className={cx(
                    tableStyles.headerCell,
                    tableStyles.alignLeft,
                    styles.stickySerialCell,
                    styles.stickySerialHeader,
                  )}
                  style={{ width: SERIAL_NUMBER_COLUMN_WIDTH }}
                >
                  <span className={tableStyles.headerText}>S.No</span>
                </th>
                {columns.map((column) => (
                  <th
                    key={column.key}
                    className={cx(tableStyles.headerCell, getAlignClass(column.align))}
                    style={{ width: column.width }}
                  >
                    <span className={tableStyles.headerText}>{column.header}</span>
                  </th>
                ))}
                <th className={cx(tableStyles.headerCell, tableStyles.alignCenter)}>
                  <span className={tableStyles.headerText}>Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className={tableStyles.body}>
              {filteredRows.length === 0 ? (
                <tr className={cx(tableStyles.row, tableStyles.rowOdd)}>
                  <td
                    className={cx(tableStyles.cell, tableStyles.emptyCell)}
                    colSpan={columns.length + 2}
                  >
                    No stock lines match the current search.
                  </td>
                </tr>
              ) : (
                filteredRows.map((row, index) => (
                  <tr
                    key={row.id}
                    className={cx(
                      styles.dataRow,
                      tableStyles.row,
                      index % 2 === 0 ? tableStyles.rowOdd : tableStyles.rowEven,
                    )}
                  >
                    <td
                      data-label="S.No"
                      className={cx(
                        tableStyles.cell,
                        tableStyles.alignLeft,
                        styles.stickySerialCell,
                      )}
                    >
                      <span className={styles.rowNumber}>{index + 1}</span>
                    </td>
                    {columns.map((column) => {
                      const value = row.values[column.key] ?? "";
                      const isNumeric = column.kind === "number";
                      const sharedClassName = cx(
                        styles.cellInput,
                        isNumeric && styles.numericInput,
                      );
                      const lookupKind = column.lookupKind;
                      const lookupFieldConfig = lookupKind ? LOOKUP_FIELD_CONFIG[lookupKind] : null;
                      const cellLookupKey = `${row.id}:${column.key}`;
                      const isLookupOpen = openLookupCell?.key === cellLookupKey;
                      const selectedLookupId = lookupFieldConfig
                        ? row.values[lookupFieldConfig.idField] ?? ""
                        : "";
                      const selectedLookupLabel = lookupKind
                        ? (
                            lookupKind === "item"
                              ? itemOptionsByValue.get(selectedLookupId)
                              : godownOptionsByValue.get(selectedLookupId)
                          ) ?? value
                        : value;
                      const lookupOptions = lookupKind
                        ? lookupKind === "item"
                          ? filteredItemOptions
                          : filteredGodownOptions
                        : [];
                      const isLookupLoading = lookupKind
                        ? lookupKind === "item"
                          ? isItemLookupLoading
                          : isGodownLookupLoading
                        : false;

                      return (
                        <td
                          key={column.key}
                          data-label={column.header}
                          className={cx(tableStyles.cell, getAlignClass(column.align))}
                        >
                          {column.kind === "lookup" && lookupKind && lookupFieldConfig ? (
                            <div
                              className={styles.lookupCell}
                              ref={(element) => {
                                lookupRootRefs.current[cellLookupKey] = element;
                              }}
                            >
                              <button
                                type="button"
                                className={cx(
                                  styles.lookupTrigger,
                                  isLookupOpen && styles.lookupTriggerOpen,
                                )}
                                onClick={() => {
                                  setOpenLookupCell((currentCell) =>
                                    currentCell?.key === cellLookupKey
                                      ? null
                                      : { key: cellLookupKey, kind: lookupKind },
                                  );
                                  setLookupSearchQuery("");
                                }}
                                aria-expanded={isLookupOpen}
                                aria-haspopup="listbox"
                              >
                                <span
                                  className={cx(
                                    styles.lookupTriggerLabel,
                                    !selectedLookupLabel && styles.lookupPlaceholder,
                                  )}
                                >
                                  {selectedLookupLabel || column.placeholder || column.header}
                                </span>
                                <FiChevronDown
                                  className={cx(
                                    styles.lookupChevron,
                                    isLookupOpen && styles.lookupChevronOpen,
                                  )}
                                  aria-hidden="true"
                                />
                              </button>
                              {isLookupOpen ? (
                                <div className={styles.lookupMenu}>
                                  <div className={styles.lookupSearchWrap}>
                                    <FiSearch
                                      className={styles.lookupSearchIcon}
                                      aria-hidden="true"
                                    />
                                    <input
                                      ref={lookupSearchInputRef}
                                      type="text"
                                      value={lookupSearchQuery}
                                      onChange={(event) => {
                                        const nextQuery = event.target.value;
                                        setLookupSearchQuery(nextQuery);
                                        handleLookupSearchChange(lookupKind, nextQuery);
                                      }}
                                      placeholder={column.placeholder || `Search ${column.header}`}
                                      className={styles.lookupSearchInput}
                                      autoComplete="off"
                                    />
                                  </div>
                                  <div className={styles.lookupOptions} role="listbox">
                                    {lookupOptions.length > 0 ? (
                                      lookupOptions.map((option) => (
                                        <button
                                          key={`${cellLookupKey}-${option.value}`}
                                          type="button"
                                          className={cx(
                                            styles.lookupOption,
                                            option.value === selectedLookupId &&
                                              styles.lookupOptionActive,
                                          )}
                                          onClick={() =>
                                            handleLookupSelection(row.id, lookupKind, option)
                                          }
                                        >
                                          {option.label}
                                        </button>
                                      ))
                                    ) : (
                                      <div className={styles.lookupEmptyState}>
                                        {isLookupLoading
                                          ? "Loading options..."
                                          : LOOKUP_FIELD_CONFIG[lookupKind].emptyMessage}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          ) : column.kind === "select" ? (
                            <select
                              value={value}
                              onChange={(event) =>
                                handleRowChange(row.id, column.key, event.target.value)
                              }
                              className={styles.cellSelect}
                            >
                              {(column.options ?? []).map((option) => (
                                <option key={option} value={option}>
                                  {option}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <input
                              type={column.kind === "date" ? "date" : isNumeric ? "number" : "text"}
                              value={value}
                              onChange={(event) =>
                                handleRowChange(row.id, column.key, event.target.value)
                              }
                              className={sharedClassName}
                              placeholder={column.placeholder}
                              step={column.kind === "number" ? column.step : undefined}
                            />
                          )}
                        </td>
                      );
                    })}
                    <td
                      data-label="Actions"
                      className={cx(
                        tableStyles.cell,
                        tableStyles.actionsCell,
                        tableStyles.alignCenter,
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => handleRemoveRow(row.id)}
                        className={cx(tableStyles.actionButton, tableStyles.deleteButton)}
                        aria-label={`Remove row ${index + 1}`}
                        title="Remove row"
                      >
                        <FiTrash2 className={styles.actionIcon} aria-hidden="true" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className={tableStyles.paginationBar}>
          <div className={tableStyles.paginationInfo}>
            <span>{visibleTotals.lines} visible lines</span>
            <span>{QUANTITY_FORMATTER.format(visibleTotals.qty)} qty</span>
            <span>{QUANTITY_FORMATTER.format(visibleTotals.freeQty)} free qty</span>
          </div>
          <div className={styles.footerValue}>
            <span className={styles.footerLabel}>Visible stock value</span>
            <strong>{VALUE_FORMATTER.format(visibleTotals.value)}</strong>
          </div>
        </div>
      </div>
    </section>
  );
}
