"use client";

/**
 * The Cash Office's left-hand tabs (Qt `tabsLeft`): the picked safe's book
 * (grid 158, TILL SAFE BOOK — every movement since its last count) and the
 * branch's remittances (grid 157, TILL REMITTANCES — the last 90 days, by
 * status), whose picked row Void remittance… takes. Which columns, in what
 * order and under what headings is the grids' own config; the fallbacks in
 * `cash-office.ts` stand in until it is read.
 */
import { cx } from "@/components/design-system/cx";
import { textOf } from "../shared/format";
import type { GridRow } from "../shared/wire/types";
import styles from "../shared/till.module.scss";
import { GridTable } from "../sessions/grid-table";
import {
  BOOK_COLUMNS_FALLBACK,
  BOOK_HINT,
  REMIT_COLUMNS_FALLBACK,
  REMIT_STATUS_FILTERS,
  gridCellText,
  type ButtonState,
} from "./cash-office";
import { BOOK_ROW_KEY, type RowsState } from "./use-cash-office";
import local from "./cash-office.module.scss";

export function SafeBookPanel({ book, hasSafe }: { book: RowsState; hasSafe: boolean }) {
  return (
    <div className={local.deskBody}>
      <p className={styles.code}>{BOOK_HINT}</p>
      <div className={local.tableScroll}>
        <GridTable
          grid="tillSafeBook"
          rows={book.rows}
          fallbackColumns={BOOK_COLUMNS_FALLBACK}
          idField={BOOK_ROW_KEY}
          cell={gridCellText}
          loading={book.loading}
          error={book.error}
          emptyText={hasSafe ? "Nothing moved in or out since the last count." : "No safe to show."}
        />
      </div>
    </div>
  );
}

export type RemittancesPanelProps = {
  remits: RowsState;
  status: string;
  onStatus: (status: string) => void;
  pickedId: string | null;
  onPick: (row: GridRow) => void;
  voidButton: ButtonState;
  onVoid: () => void;
};

export function RemittancesPanel({ remits, status, onStatus, pickedId, onPick, voidButton, onVoid }: RemittancesPanelProps) {
  return (
    <div className={local.deskBody}>
      <div className={local.filterRow}>
        <label className={styles.formLabel} htmlFor="till-safe-remit-status">
          Status
        </label>
        <select
          id="till-safe-remit-status"
          className={cx(styles.select, local.statusSelect)}
          value={status}
          onChange={(event) => onStatus(event.target.value)}
        >
          {REMIT_STATUS_FILTERS.map((option) => (
            <option key={option.value || "all"} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <span className={styles.spacer} />
        <button
          type="button"
          className={styles.dangerButton}
          disabled={!voidButton.enabled}
          title={voidButton.title}
          onClick={onVoid}
        >
          Void remittance…
        </button>
      </div>
      <div className={local.tableScroll}>
        <GridTable
          grid="tillRemittances"
          rows={remits.rows}
          fallbackColumns={REMIT_COLUMNS_FALLBACK}
          idField="tcm_id"
          cell={(row, field) => (field === "rm_status" ? <RemitStatus row={row} /> : gridCellText(row, field))}
          loading={remits.loading}
          error={remits.error}
          emptyText="No remittance in the last 90 days."
          selectedId={pickedId}
          onSelect={onPick}
          label="Remittances"
        />
      </div>
    </div>
  );
}

/** The status cell, toned as the transit list reads it: on the way amber, voided red. */
function RemitStatus({ row }: { row: GridRow }) {
  const text = textOf(row, "rm_status");
  const voided = textOf(row, "tcm_status") === "VOIDED";
  const transit = !voided && textOf(row, "tcm_remit_status") === "IN_TRANSIT";
  return <span className={cx(voided && styles.toneRed, transit && styles.toneAmber)}>{text}</span>;
}
