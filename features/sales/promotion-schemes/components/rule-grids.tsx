"use client";

/**
 * The four grids of the Promotion Scheme entry — Qt's four NexTables and their
 * delegates (promotion_scheme_delegate.cpp). Every rule a delegate made
 * "untypeable" is a disabled cell here, never a refusal at save:
 *
 *  - Target / Branch / Free item are PICKED (configured POPUP grids), never
 *    typed — a typed name would match no id. Typing a letter, Enter, F2 or a
 *    click opens the picker; the row's Kind decides which master it searches.
 *  - Unit is offered only on an ITEM row that has an item (ck_pri_unit).
 *  - An EXCLUDE item row gives nothing, so its rates and factor lock.
 *  - Item rate columns follow the header's benefit; band columns follow
 *    ck_prs_benefit_columns and the ones that do not belong are hidden.
 *  - Max Rpt is open only while Repeat is ticked (ck_prs_each).
 *
 * Every grid keeps a trailing blank row — the "type here to add" row — and the
 * vertical header numbers the rows (`#`).
 */
import { type KeyboardEvent, type ReactNode } from "react";
import { cx } from "@/components/design-system/cx";
import {
  ITEM_SCOPES,
  PARTY_SCOPES,
  RATE_COLUMNS,
  benefitUsesBands,
  itemRateAllowed,
  slabColumnAllowed,
  type PromotionBenefit,
  type RateColumn,
  type SlabBenefitColumn,
} from "../promotion-schemes.vocab";
import {
  acceptNumberText,
  type BranchRow,
  type GridName,
  type ItemEditField,
  type ItemRow,
  type ItemUnit,
  type PartyRow,
  type SchemeAction,
  type SlabEditField,
  type SlabRow,
} from "../promotion-schemes.state";
import styles from "../page.module.scss";

export type PickRequest = { grid: GridName; index: number; initialQuery: string };

type Dispatch = (action: SchemeAction) => void;

/** The id a focus request names a cell by — `cell:<grid>:<row>:<column>`. */
export function cellFocusKey(grid: GridName, row: number, column: string): string {
  return `cell:${grid}:${row}:${column}`;
}

// ── Cells ─────────────────────────────────────────────────────────────────

type TextCellProps = {
  focusKey: string;
  label: string;
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
};

function TextCell({ focusKey, label, value, disabled, onChange }: TextCellProps) {
  return (
    <input
      className={styles.cellInput}
      data-focus-key={focusKey}
      data-walk="true"
      aria-label={label}
      autoComplete="off"
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

type NumberCellProps = TextCellProps & { decimals: number; max?: number };

/** A QDoubleValidator in a cell: digits and one point, so many decimals, so high. */
function NumberCell({ focusKey, label, value, disabled, decimals, max, onChange }: NumberCellProps) {
  return (
    <input
      className={cx(styles.cellInput, styles.cellNumber)}
      data-focus-key={focusKey}
      data-walk="true"
      aria-label={label}
      autoComplete="off"
      inputMode={decimals > 0 ? "decimal" : "numeric"}
      value={value}
      disabled={disabled}
      onChange={(event) => {
        const next = event.target.value.trim();
        if (acceptNumberText(next, decimals, max)) onChange(next);
      }}
    />
  );
}

type CheckCellProps = { focusKey: string; label: string; checked: boolean; disabled?: boolean; onChange: (checked: boolean) => void };

function CheckCell({ focusKey, label, checked, disabled, onChange }: CheckCellProps) {
  return (
    <input
      type="checkbox"
      className={styles.cellCheck}
      data-focus-key={focusKey}
      data-walk="true"
      aria-label={label}
      checked={checked}
      disabled={disabled}
      onChange={(event) => onChange(event.target.checked)}
    />
  );
}

type SelectCellProps = {
  focusKey: string;
  label: string;
  value: string;
  options: readonly { value: string; label: string }[];
  placeholder?: string;
  disabled?: boolean;
  onChange: (value: string) => void;
};

function SelectCell({ focusKey, label, value, options, placeholder, disabled, onChange }: SelectCellProps) {
  return (
    <select
      className={styles.cellSelect}
      data-focus-key={focusKey}
      data-walk="true"
      aria-label={label}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
    >
      {!value ? <option value="">{placeholder ?? ""}</option> : null}
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

type PickerCellProps = {
  focusKey: string;
  label: string;
  value: string;
  placeholder: string;
  disabled?: boolean;
  onOpen: (initialQuery: string) => void;
};

/** A picked cell: a printable key opens the picker searching for it; Enter, F2, Space or a click opens it blank. */
function PickerCell({ focusKey, label, value, placeholder, disabled, onOpen }: PickerCellProps) {
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.ctrlKey || event.altKey || event.metaKey) return;
    if (event.key === "Enter" || event.key === "F2" || event.key === " ") {
      event.preventDefault();
      event.stopPropagation();
      onOpen("");
      return;
    }
    if (event.key.length === 1 && /\S/.test(event.key)) {
      event.preventDefault();
      event.stopPropagation();
      onOpen(event.key);
    }
  };
  return (
    <button
      type="button"
      className={cx(styles.cellPicker, !value && styles.cellPickerEmpty)}
      data-focus-key={focusKey}
      data-walk="true"
      aria-label={label}
      title={disabled ? undefined : "Type to search · Enter or F2 opens the list"}
      disabled={disabled}
      onClick={() => onOpen("")}
      onKeyDown={onKeyDown}
    >
      {value || placeholder}
    </button>
  );
}

// ── The table ─────────────────────────────────────────────────────────────

type Column<R> = {
  key: string;
  title: string;
  /** Qt `defaultWidthPercent`, normalised over the visible columns. */
  width: number;
  align?: "right" | "center";
  cell: (row: R, index: number) => ReactNode;
};

type RuleTableProps<R extends { key: string }> = {
  grid: GridName;
  label: string;
  columns: readonly Column<R>[];
  rows: readonly R[];
  disabled: boolean;
};

function RuleTable<R extends { key: string }>({ grid, label, columns, rows, disabled }: RuleTableProps<R>) {
  const total = columns.reduce((sum, column) => sum + column.width, 0) || 1;
  return (
    // A disabled fieldset is Qt's `setEnabled(false)` on the grid: nothing in it takes input.
    <fieldset className={styles.gridFieldset} disabled={disabled}>
      <div className={cx(styles.gridViewport, disabled && styles.gridDisabled)}>
        <table className={styles.ruleTable} aria-label={label} data-grid={grid}>
          <colgroup>
            <col className={styles.rowNumberCol} />
            {columns.map((column) => (
              <col key={column.key} style={{ width: `${(column.width / total) * 100}%` }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th scope="col" className={styles.rowNumberHead}>
                #
              </th>
              {columns.map((column) => (
                <th key={column.key} scope="col">
                  {column.title}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.key} data-row-index={index} data-grid={grid}>
                <th scope="row" className={styles.rowNumber}>
                  {index + 1}
                </th>
                {columns.map((column) => (
                  <td key={column.key} className={column.align === "right" ? styles.cellRight : column.align === "center" ? styles.cellCenter : undefined}>
                    {column.cell(row, index)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </fieldset>
  );
}

// ── Branches (sales.promotion_scheme_branch) ──────────────────────────────

export function BranchGrid({
  rows,
  disabled,
  dispatch,
  onPick,
}: {
  rows: readonly BranchRow[];
  disabled: boolean;
  dispatch: Dispatch;
  onPick: (request: PickRequest) => void;
}) {
  const columns: Column<BranchRow>[] = [
    {
      key: "branch",
      title: "Branch",
      width: 48,
      cell: (row, index) => (
        <PickerCell
          focusKey={cellFocusKey("branches", index, "branch")}
          label={`Row ${index + 1} branch`}
          value={row.branchName}
          placeholder={index === rows.length - 1 ? "add a row…" : ""}
          onOpen={(initialQuery) => onPick({ grid: "branches", index, initialQuery })}
        />
      ),
    },
    {
      key: "exclude",
      title: "Exclude",
      width: 12,
      align: "center",
      cell: (row, index) => (
        <CheckCell
          focusKey={cellFocusKey("branches", index, "exclude")}
          label={`Row ${index + 1} exclude`}
          checked={row.exclude}
          onChange={(exclude) => dispatch({ type: "branchEdit", index, patch: { exclude } })}
        />
      ),
    },
    {
      key: "notes",
      title: "Notes",
      width: 40,
      cell: (row, index) => (
        <TextCell
          focusKey={cellFocusKey("branches", index, "notes")}
          label={`Row ${index + 1} notes`}
          value={row.notes}
          onChange={(notes) => dispatch({ type: "branchEdit", index, patch: { notes } })}
        />
      ),
    },
  ];
  return <RuleTable grid="branches" label="Branches" columns={columns} rows={rows} disabled={disabled} />;
}

// ── Customers (sales.promotion_scheme_party) ──────────────────────────────

const PARTY_KIND_OPTIONS = PARTY_SCOPES.map((scope) => ({ value: scope.code, label: scope.code }));
const ITEM_KIND_OPTIONS = ITEM_SCOPES.map((scope) => ({ value: scope.code, label: scope.code }));

export function PartyGrid({
  rows,
  disabled,
  onKind,
  dispatch,
  onPick,
}: {
  rows: readonly PartyRow[];
  disabled: boolean;
  onKind: (index: number, kind: string) => void;
  dispatch: Dispatch;
  onPick: (request: PickRequest) => void;
}) {
  const columns: Column<PartyRow>[] = [
    {
      key: "kind",
      title: "Kind",
      width: 20,
      cell: (row, index) => (
        <SelectCell
          focusKey={cellFocusKey("parties", index, "kind")}
          label={`Row ${index + 1} kind`}
          value={row.kind}
          options={PARTY_KIND_OPTIONS}
          placeholder={index === rows.length - 1 ? "add a row…" : ""}
          onChange={(kind) => onKind(index, kind)}
        />
      ),
    },
    {
      key: "target",
      title: "Target",
      width: 34,
      cell: (row, index) => (
        <PickerCell
          focusKey={cellFocusKey("parties", index, "target")}
          label={`Row ${index + 1} target`}
          value={row.targetName}
          placeholder={row.kind ? "pick…" : ""}
          // No kind, no master to search: typing in Target does nothing.
          disabled={!row.kind}
          onOpen={(initialQuery) => onPick({ grid: "parties", index, initialQuery })}
        />
      ),
    },
    {
      key: "exclude",
      title: "Exclude",
      width: 11,
      align: "center",
      cell: (row, index) => (
        <CheckCell
          focusKey={cellFocusKey("parties", index, "exclude")}
          label={`Row ${index + 1} exclude`}
          checked={row.exclude}
          onChange={(exclude) => dispatch({ type: "partyEdit", index, patch: { exclude } })}
        />
      ),
    },
    {
      key: "priority",
      title: "Priority",
      width: 11,
      align: "right",
      cell: (row, index) => (
        // ck_prp_match_priority BETWEEN 0 AND 9 — untypeable beyond it.
        <NumberCell
          focusKey={cellFocusKey("parties", index, "priority")}
          label={`Row ${index + 1} priority`}
          value={row.priority}
          decimals={0}
          max={9}
          onChange={(priority) => dispatch({ type: "partyEdit", index, patch: { priority } })}
        />
      ),
    },
    {
      key: "notes",
      title: "Notes",
      width: 24,
      cell: (row, index) => (
        <TextCell
          focusKey={cellFocusKey("parties", index, "notes")}
          label={`Row ${index + 1} notes`}
          value={row.notes}
          onChange={(notes) => dispatch({ type: "partyEdit", index, patch: { notes } })}
        />
      ),
    },
  ];
  return <RuleTable grid="parties" label="Customers" columns={columns} rows={rows} disabled={disabled} />;
}

// ── Items (sales.promotion_scheme_item) ───────────────────────────────────

const RATE_TITLES: Record<RateColumn, string> = { discPerc: "Disc %", discQty: "Rs/Qty", discAmt: "Disc Amt" };
/** Decimals mirror the column types (18,4 / 18,4 / 18,2); Disc % stops at 100. */
const RATE_DECIMALS: Record<RateColumn, number> = { discPerc: 4, discQty: 4, discAmt: 2 };

export function ItemGrid({
  rows,
  benefit,
  disabled,
  unitsFor,
  onKind,
  dispatch,
  onPick,
}: {
  rows: readonly ItemRow[];
  benefit: PromotionBenefit;
  disabled: boolean;
  unitsFor: (itemId: string) => readonly ItemUnit[] | undefined;
  onKind: (index: number, kind: string) => void;
  dispatch: Dispatch;
  onPick: (request: PickRequest) => void;
}) {
  const edit = (index: number, field: ItemEditField, value: string | boolean) =>
    dispatch({ type: "itemEdit", index, field, value });

  const rateColumns: Column<ItemRow>[] = RATE_COLUMNS.filter((column) => itemRateAllowed(benefit, column)).map(
    (column) => ({
      key: column,
      title: RATE_TITLES[column],
      width: 8,
      align: "right" as const,
      cell: (row: ItemRow, index: number) => (
        <NumberCell
          focusKey={cellFocusKey("items", index, column)}
          label={`Row ${index + 1} ${RATE_TITLES[column]}`}
          value={row[column]}
          decimals={RATE_DECIMALS[column]}
          max={column === "discPerc" ? 100 : undefined}
          // ck_pri_exclude — an exclusion gives nothing.
          disabled={row.exclude}
          onChange={(value) => edit(index, column, value)}
        />
      ),
    }),
  );

  const columns: Column<ItemRow>[] = [
    {
      key: "kind",
      title: "Kind",
      width: 13,
      cell: (row, index) => (
        <SelectCell
          focusKey={cellFocusKey("items", index, "kind")}
          label={`Row ${index + 1} kind`}
          value={row.kind}
          options={ITEM_KIND_OPTIONS}
          placeholder={index === rows.length - 1 ? "add a row…" : ""}
          onChange={(kind) => onKind(index, kind)}
        />
      ),
    },
    {
      key: "target",
      title: "Target",
      width: 22,
      cell: (row, index) => (
        <PickerCell
          focusKey={cellFocusKey("items", index, "target")}
          label={`Row ${index + 1} target`}
          value={row.targetName}
          placeholder={row.kind ? "pick…" : ""}
          disabled={!row.kind}
          onOpen={(initialQuery) => onPick({ grid: "items", index, initialQuery })}
        />
      ),
    },
    {
      key: "unit",
      title: "Unit",
      width: 11,
      cell: (row, index) => {
        const units = row.kind === "ITEM" && row.scopeId ? unitsFor(row.scopeId) : undefined;
        // ck_pri_unit — a unit on ITEM rows only, and only once the row has an item.
        const options = units && units.length > 0 ? units.map((unit) => ({ value: unit.id, label: unit.name })) : [];
        const shown = options.length > 0 ? options : row.unitId ? [{ value: row.unitId, label: row.unitName }] : [];
        return (
          <SelectCell
            focusKey={cellFocusKey("items", index, "unit")}
            label={`Row ${index + 1} unit`}
            value={row.unitId}
            options={shown}
            disabled={row.kind !== "ITEM" || !row.scopeId || options.length === 0}
            onChange={(unitId) => {
              const unit = options.find((option) => option.value === unitId);
              if (unit) dispatch({ type: "itemUnit", index, unitId: unit.value, unitName: unit.label });
            }}
          />
        );
      },
    },
    {
      key: "exclude",
      title: "Exclude",
      width: 8,
      align: "center",
      cell: (row, index) => (
        <CheckCell
          focusKey={cellFocusKey("items", index, "exclude")}
          label={`Row ${index + 1} exclude`}
          checked={row.exclude}
          onChange={(exclude) => edit(index, "exclude", exclude)}
        />
      ),
    },
    ...rateColumns,
    {
      key: "minQty",
      title: "Min Qty",
      width: 8,
      align: "right",
      cell: (row, index) => (
        <NumberCell
          focusKey={cellFocusKey("items", index, "minQty")}
          label={`Row ${index + 1} min qty`}
          value={row.minQty}
          decimals={3}
          onChange={(value) => edit(index, "minQty", value)}
        />
      ),
    },
    {
      key: "priority",
      title: "Priority",
      width: 7,
      align: "right",
      cell: (row, index) => (
        <NumberCell
          focusKey={cellFocusKey("items", index, "priority")}
          label={`Row ${index + 1} priority`}
          value={row.priority}
          decimals={0}
          max={9}
          onChange={(value) => edit(index, "priority", value)}
        />
      ),
    },
  ];
  return <RuleTable grid="items" label="Items" columns={columns} rows={rows} disabled={disabled} />;
}

// ── Offer bands (sales.promotion_scheme_slab) ─────────────────────────────

export function SlabGrid({
  rows,
  benefit,
  byAmount,
  unitsFor,
  dispatch,
  onPick,
}: {
  rows: readonly SlabRow[];
  benefit: PromotionBenefit;
  /** *_AMOUNT trigger: the geometry is rupees, else quantity (3.0's retitling). */
  byAmount: boolean;
  unitsFor: (itemId: string) => readonly ItemUnit[] | undefined;
  dispatch: Dispatch;
  onPick: (request: PickRequest) => void;
}) {
  const edit = (index: number, field: SlabEditField, value: string | boolean) =>
    dispatch({ type: "slabEdit", index, field, value });
  const allowed = (column: SlabBenefitColumn) => slabColumnAllowed(benefit, column);
  const number = (
    field: SlabEditField & string,
    title: string,
    width: number,
    decimals: number,
    options: { max?: number; disabled?: (row: SlabRow) => boolean } = {},
  ): Column<SlabRow> => ({
    key: field,
    title,
    width,
    align: "right",
    cell: (row, index) => (
      <NumberCell
        focusKey={cellFocusKey("slabs", index, field)}
        label={`Band ${index + 1} ${title}`}
        value={row[field] as string}
        decimals={decimals}
        max={options.max}
        disabled={options.disabled?.(row)}
        onChange={(value) => edit(index, field, value)}
      />
    ),
  });

  const columns: Column<SlabRow>[] = [
    {
      key: "benefit",
      title: "Benefit",
      width: 9,
      // Mirrors the header and is never editable (fk_prs_scheme_benefit).
      cell: (row) => <span className={styles.cellReadOnly}>{row.benefit}</span>,
    },
    number("exceeds", byAmount ? "From Amt" : "From Qty", 6.5, 3),
    number("upto", byAmount ? "Upto Amt" : "Upto Qty", 6.5, 3),
    number("each", byAmount ? "Each Amt" : "Each Qty", 6, 3),
    {
      key: "isRepeat",
      title: "Repeat",
      width: 5.5,
      align: "center",
      cell: (row, index) => (
        <CheckCell
          focusKey={cellFocusKey("slabs", index, "isRepeat")}
          label={`Band ${index + 1} repeat`}
          checked={row.isRepeat}
          onChange={(value) => edit(index, "isRepeat", value)}
        />
      ),
    },
    // ck_prs_each — max repeats means nothing unless the band repeats.
    number("maxRepeats", "Max Rpt", 6, 0, { disabled: (row) => !row.isRepeat }),
  ];

  if (allowed("freeItem")) {
    columns.push(
      {
        key: "freeItem",
        title: "Free item",
        width: 15,
        cell: (row, index) => (
          <PickerCell
            focusKey={cellFocusKey("slabs", index, "freeItem")}
            label={`Band ${index + 1} free item`}
            value={row.freeItemName}
            placeholder="pick…"
            onOpen={(initialQuery) => onPick({ grid: "slabs", index, initialQuery })}
          />
        ),
      },
      {
        key: "freeUnit",
        title: "Unit",
        width: 8,
        cell: (row, index) => {
          const units = row.freeItemId ? unitsFor(row.freeItemId) : undefined;
          const options = units && units.length > 0 ? units.map((unit) => ({ value: unit.id, label: unit.name })) : [];
          const shown = options.length > 0 ? options : row.freeUnitId ? [{ value: row.freeUnitId, label: row.freeUnitName }] : [];
          return (
            // ck_prs_free_unit_pair: no free item, no free unit.
            <SelectCell
              focusKey={cellFocusKey("slabs", index, "freeUnit")}
              label={`Band ${index + 1} free unit`}
              value={row.freeUnitId}
              options={shown}
              disabled={!row.freeItemId || options.length === 0}
              onChange={(unitId) => {
                const unit = options.find((option) => option.value === unitId);
                if (unit) dispatch({ type: "slabFreeUnit", index, unitId: unit.value, unitName: unit.label });
              }}
            />
          );
        },
      },
      number("freeQty", "Free Qty", 6.5, 3),
      {
        key: "freeStockCheck",
        title: "Stock chk",
        width: 6.5,
        align: "center",
        cell: (row, index) => (
          <CheckCell
            focusKey={cellFocusKey("slabs", index, "freeStockCheck")}
            label={`Band ${index + 1} stock check`}
            checked={row.freeStockCheck}
            onChange={(value) => edit(index, "freeStockCheck", value)}
          />
        ),
      },
    );
  }
  if (allowed("discPerc")) columns.push(number("discPerc", "Disc %", 6, 4, { max: 100 }));
  if (allowed("discQty")) columns.push(number("discQty", "Rs/Qty", 6, 4));
  if (allowed("discAmt")) columns.push(number("discAmt", "Disc Amt", 6, 2));
  if (allowed("fixedPrice")) columns.push(number("fixedPrice", "Fixed Price", 7, 4));
  columns.push(number("maxBenefitAmt", "Max Amt", 6.5, 2));

  if (!benefitUsesBands(benefit)) return null;
  return <RuleTable grid="slabs" label="Offer bands" columns={columns} rows={rows} disabled={false} />;
}
