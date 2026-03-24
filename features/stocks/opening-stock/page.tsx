"use client";

import { type CSSProperties, type ReactNode, useEffect, useState } from "react";
import { FiPlus, FiSearch, FiTrash2 } from "react-icons/fi";
import tableStyles from "@/components/ui/table.module.scss";
import { useApi } from "@/hooks/useApi";
import type { ApiSuccessResponse, ListMeta } from "@/utils/types";
import styles from "./page.module.scss";

type ColumnAlign = "left" | "center" | "right";
type ColumnKind = "text" | "number" | "date" | "select";

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
const UI_TABLE_COLUMNS_QUERY = {
  uiTblClmTableId: "5",
  page: "1",
  limit: "100",
} as const;
const UI_TABLE_COLUMNS_TOAST_OPTIONS = {
  success: false,
  error: false,
} as const;
const SERIAL_NUMBER_COLUMN_WIDTH = "76px";
const ACTION_COLUMN_WIDTH = "90px";

const TRACKING_OPTIONS = ["NONE", "BATCH", "LOT"] as const;
const PROFIT_TYPE_OPTIONS = ["PERCENT", "VALUE"] as const;
const CESS_TYPE_OPTIONS = ["NONE", "PERCENT", "PER_UNIT"] as const;

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
    kind: "text",
    placeholder: "Item name",
  },
  godown: {
    header: "Godown",
    defaultWidth: "150px",
    align: "left",
    kind: "text",
    placeholder: "Godown",
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

const INITIAL_ROWS: OpeningStockRow[] = [
  createRow(1, {
    barcode: "8901000000011",
    code: "RM-1001",
    itemname: "Raw Sugar - Grade A",
    godown: "Main Warehouse",
    uom: "Kg",
    taxname: "GST 5%",
    openingqty: "250.000",
    freeqty: "0.000",
    baseqty: "250.000",
    convfactor: "1.000",
    batchno: "BCH-2401",
    batchdate: "2026-01-02",
    mfgdate: "2025-12-15",
    expirydate: "2027-12-15",
    costprice: "38.50",
    costwot: "36.67",
    profittype: "PERCENT",
    roundoff: "0.00",
    priceawot: "40.00",
    priceamarkup: "8.00",
    pricea: "42.00",
    pricebwot: "41.42",
    pricebmarkup: "13.00",
    priceb: "43.50",
    pricecwot: "42.86",
    pricecmarkup: "17.50",
    pricec: "45.00",
    pricedwot: "44.29",
    pricedmarkup: "21.50",
    priced: "46.50",
    mrp: "45.00",
    msp: "41.50",
    remarks: "Opening balance migrated",
    oslitemid: "ITM-1001",
    oslunitid: "UOM-KG",
    oslbaseuomid: "UOM-KG",
    oslgodownid: "GD-01",
    osltrackingtype: "BATCH",
    osltaxid: "TAX-5",
    osltaxperc: "5.000",
    oslcesstype: "NONE",
    oslcessperc: "0.000",
    oslcessperunit: "0.00",
  }),
  createRow(2, {
    barcode: "8901000001450",
    code: "PK-2104",
    itemname: "Packaging Pouch - 1 Kg",
    godown: "Packing Store",
    uom: "Nos",
    taxname: "GST 12%",
    openingqty: "1200.000",
    freeqty: "25.000",
    baseqty: "1200.000",
    convfactor: "1.000",
    batchno: "",
    serialno: "",
    costprice: "4.85",
    costwot: "4.33",
    profittype: "VALUE",
    roundoff: "0.00",
    priceawot: "5.54",
    priceamarkup: "0.66",
    pricea: "6.20",
    pricebwot: "5.98",
    pricebmarkup: "1.10",
    priceb: "6.70",
    pricecwot: "6.43",
    pricecmarkup: "1.60",
    pricec: "7.20",
    pricedwot: "6.88",
    pricedmarkup: "2.10",
    priced: "7.70",
    mrp: "7.00",
    msp: "6.40",
    remarks: "Physical stock as on cutover",
    oslitemid: "ITM-2104",
    oslunitid: "UOM-NOS",
    oslbaseuomid: "UOM-NOS",
    oslgodownid: "GD-02",
    osltrackingtype: "NONE",
    osltaxid: "TAX-12",
    osltaxperc: "12.000",
    oslcesstype: "NONE",
    oslcessperc: "0.000",
    oslcessperunit: "0.00",
  }),
  createRow(3, {
    barcode: "8901000003218",
    code: "FG-5007",
    itemname: "Premium Basmati Rice 5 Kg",
    godown: "Finished Goods",
    uom: "Bag",
    taxname: "GST 5%",
    openingqty: "85.000",
    freeqty: "4.000",
    baseqty: "85.000",
    convfactor: "1.000",
    batchno: "LOT-5007-A",
    serialno: "SR-5007-01",
    batchdate: "2026-03-01",
    mfgdate: "2026-02-15",
    expirydate: "2027-02-15",
    costprice: "465.00",
    costwot: "442.86",
    profittype: "PERCENT",
    roundoff: "0.00",
    priceawot: "514.29",
    priceamarkup: "7.50",
    pricea: "540.00",
    pricebwot: "528.57",
    pricebmarkup: "10.50",
    priceb: "555.00",
    pricecwot: "542.86",
    pricecmarkup: "13.50",
    pricec: "570.00",
    pricedwot: "552.38",
    pricedmarkup: "15.75",
    priced: "580.00",
    mrp: "575.00",
    msp: "548.00",
    remarks: "Warehouse verified",
    oslitemid: "ITM-5007",
    oslunitid: "UOM-BAG",
    oslbaseuomid: "UOM-BAG",
    oslgodownid: "GD-03",
    osltrackingtype: "LOT",
    osltaxid: "TAX-5",
    osltaxperc: "5.000",
    oslcesstype: "NONE",
    oslcessperc: "0.000",
    oslcessperunit: "0.00",
  }),
];
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
  const { getAll: listUiTableColumns, loading: isConfigLoading, error: configError } = useApi<
    ApiSuccessResponse<UiTableColumnPayload[], ListMeta>
  >(UI_TABLE_COLUMNS_LIST_ENDPOINT, {
    toast: UI_TABLE_COLUMNS_TOAST_OPTIONS,
  });
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

  const handleAddRow = () => {
    setRows((currentRows) => [...currentRows, createEmptyRow(getNextRowId(currentRows))]);
  };

  const handleRemoveRow = (rowId: number) => {
    setRows((currentRows) => currentRows.filter((row) => row.id !== rowId));
  };

  const tableMinWidth = getTableMinWidth(columns);

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headingBlock}>
          <span className={styles.eyebrow}>Inventory / Stock Entry</span>
          <div className={styles.headingRow}>
            <div>
              <h1 className={styles.title}>Opening Stock</h1>
              <p className={styles.description}>
                Column name, width, position, and visibility are taken from the UI table column
                configuration for table id 5.
              </p>
            </div>
            <div className={styles.badgeRow}>
              <span className={styles.badge}>Draft voucher</span>
              <span className={styles.badge}>Config driven columns</span>
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
          <div>
            <h2 className={tableStyles.toolbarTitle}>Opening Stock Lines</h2>
            <p className={styles.toolbarNote}>
              Search, edit, add, and remove stock lines directly from this page.
            </p>
            <p className={styles.configMeta}>{configStatusText}</p>
          </div>
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

                      return (
                        <td
                          key={column.key}
                          data-label={column.header}
                          className={cx(tableStyles.cell, getAlignClass(column.align))}
                        >
                          {column.kind === "select" ? (
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
