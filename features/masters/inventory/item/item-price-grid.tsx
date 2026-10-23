"use client";
/**
 * The Item card's Pricing grid: the shared linked-records editor plus what Qt
 * NexERP's ItemPriceGridController draws around it (2026-10-22) — the price
 * level bands over the header, the stock-bucket cells held fixed, the ↑ / ↓
 * beside a moved figure, the "what each price earns" line under the grid,
 * Tab leaving the grid, and a unit pick moving on along the row. The rules
 * themselves are in item-price-grid.utils.ts.
 */
import { type ComponentProps, useMemo, useState } from "react";
import { useGetEffectiveSettingsQuery } from "@/store/api/appSettingsApi";
import ItemLinkedRecordsEditor from "./item-linked-records-editor";
import {
  parseLinkedRecordRows,
  serializeLinkedRecordRows,
  type LinkedRecordColumn,
  type LinkedRecordOption,
} from "./item-linked-records-editor.shared";
import { ITEM_PRICE_MARGIN_SALE_FIELD_PAIRS } from "./item-master-page.constants";
import {
  buildItemPriceLevelBands,
  buildItemPriceProfitSummary,
  parseItemPriceDefaultLevel,
  resolveItemPriceChangeMark,
  resolveItemPriceLockReason,
  settleItemPriceProfitPercent,
  type ItemPriceLevels,
} from "./item-price-grid.utils";
import styles from "./item-price-grid.module.scss";

type ItemLinkedRecordsEditorProps = ComponentProps<typeof ItemLinkedRecordsEditor>;

type ItemPriceGridProps = Omit<
  ItemLinkedRecordsEditorProps,
  | "headerBands"
  | "onActiveRowChange"
  | "onCellBlur"
  | "tabLeavesGrid"
  | "advanceAfterSelectColumnKeys"
> & {
  levels: ItemPriceLevels;
  /** The item's units (Unit Conversion), for the line's "Profit per BOX". */
  unitOptions: readonly LinkedRecordOption[];
  /** The scope `sales.default_price_level` is read at (a sale-price bucket's level). */
  companyId: string;
  branchId: string;
};

const PROFIT_FIELD_NAMES = new Set<string>(
  ITEM_PRICE_MARGIN_SALE_FIELD_PAIRS.map((pair) => pair.marginFieldName),
);
// The cells a stock-bucket row may hold fixed, and the ones that show ↑ / ↓.
const LOCKABLE_FIELD_NAMES = new Set<string>([
  "ipm_max_price",
  ...ITEM_PRICE_MARGIN_SALE_FIELD_PAIRS.flatMap((pair) => [
    pair.marginFieldName,
    pair.saleWotFieldName,
    pair.saleFieldName,
  ]),
]);
const MARKABLE_FIELD_NAMES = new Set<string>(
  ITEM_PRICE_MARGIN_SALE_FIELD_PAIRS.flatMap((pair) => [pair.marginFieldName, pair.saleFieldName]),
);
const UNIT_COLUMN_KEYS = ["ipm_unit_id"];

export default function ItemPriceGrid({
  levels,
  unitOptions,
  companyId,
  branchId,
  columns,
  value,
  onChange,
  ...editorProps
}: ItemPriceGridProps) {
  const { data: settings } = useGetEffectiveSettingsQuery(
    { companyId, branchId },
    { skip: !companyId },
  );
  const defaultPriceLevel = parseItemPriceDefaultLevel(settings);
  const [activeRowIndex, setActiveRowIndex] = useState<number | null>(null);
  const rows = useMemo(() => parseLinkedRecordRows(value), [value]);
  const gridColumns = useMemo(
    () =>
      columns.map((column): LinkedRecordColumn => {
        const lockable = LOCKABLE_FIELD_NAMES.has(column.key);
        const markable = MARKABLE_FIELD_NAMES.has(column.key);
        if (!lockable && !markable) {
          return column;
        }
        return {
          ...column,
          ...(lockable
            ? {
                lockReasonResolver: ({ row }) =>
                  resolveItemPriceLockReason(row, column.key, defaultPriceLevel),
              }
            : {}),
          ...(markable
            ? { cellMarkResolver: ({ row }) => resolveItemPriceChangeMark(row, column.key) }
            : {}),
        };
      }),
    [columns, defaultPriceLevel],
  );
  const bands = useMemo(() => buildItemPriceLevelBands(levels), [levels]);
  // The line follows the row the focus is in; until then, the first priced row.
  const summaryRow =
    (activeRowIndex !== null ? rows[activeRowIndex] : undefined) ??
    rows.find((row) => (row.ipm_unit_id ?? "").trim()) ??
    null;
  const summaryUnitId = (summaryRow?.ipm_unit_id ?? "").trim();
  const summary = buildItemPriceProfitSummary(summaryRow, {
    unitName: unitOptions.find((option) => option.value === summaryUnitId)?.label ?? "",
    levels,
  });
  // A typed Profit % shows only what was typed while it is edited; leaving
  // the cell settles it on what the (rounded) price really earns.
  const handleCellBlur = (rowIndex: number, columnKey: string) => {
    const row = rows[rowIndex];
    if (!row || !PROFIT_FIELD_NAMES.has(columnKey)) {
      return;
    }
    const settled = settleItemPriceProfitPercent(row, columnKey);
    if (settled !== row) {
      onChange(
        serializeLinkedRecordRows(rows.map((candidate, index) => (index === rowIndex ? settled : candidate))),
      );
    }
  };
  return (
    <div className={styles.priceGrid}>
      <ItemLinkedRecordsEditor
        {...editorProps}
        columns={gridColumns}
        value={value}
        onChange={onChange}
        headerBands={bands}
        onActiveRowChange={setActiveRowIndex}
        onCellBlur={handleCellBlur}
        tabLeavesGrid
        advanceAfterSelectColumnKeys={UNIT_COLUMN_KEYS}
      />
      <p
        className={styles.profitLine}
        title={summary.kind === "parts" ? summary.tooltip : undefined}
        data-testid="item-price-profit-line"
      >
        {summary.kind === "hint" ? (
          <span className={styles.profitHint}>{summary.text}</span>
        ) : (
          <>
            <span className={styles.profitHeading}>{summary.heading}</span>
            {summary.parts.map((part, index) => (
              <span key={`${part.label}-${index}`}>
                {index > 0 ? <span className={styles.profitSeparator}>·</span> : null}
                {part.label}{" "}
                <span className={part.loss ? styles.profitLoss : styles.profitGain}>
                  {part.amount}
                </span>
                {part.arrow ? (
                  <span className={part.arrow === "up" ? styles.profitGain : styles.profitLoss}>
                    {part.arrow === "up" ? " ↑" : " ↓"}
                  </span>
                ) : null}
              </span>
            ))}
            {summary.scheduled ? (
              <>
                <span className={styles.profitSeparator}>|</span>
                <strong>{summary.scheduled}</strong>
              </>
            ) : null}
          </>
        )}
      </p>
    </div>
  );
}
