"use client";

/**
 * Qt `pickPendingRow` — our tender rows a line of this kind may take, as the
 * matcher judges them (grid 154 TENDER SETTLEMENT - PICK ROW): a sale a
 * money-in row still waiting, a refund a money-out one, a chargeback a settled
 * one. Enter or a double-click picks; Esc backs out.
 */
import { useState } from "react";
import type { SettlementClient } from "../api/settlement-api";
import { FALLBACK_COLUMNS } from "../domain/grid-columns";
import type { GridRow } from "../domain/types";
import { useGridColumns, useGridList } from "../hooks/use-grid-list";
import { GridTable } from "./grid-table";
import { SettlementDialog } from "./settlement-dialog";
import styles from "../page.module.scss";

export type PickerRequest = {
  title: string;
  hint: string;
  params: Record<string, string>;
  onPick: (row: GridRow) => void;
};

export function RowPickerDialog({
  client,
  request,
  onClose,
}: {
  client: SettlementClient;
  request: PickerRequest;
  onClose: () => void;
}) {
  const list = useGridList(client, "tenderSettlementPickRow", request.params);
  const columns = useGridColumns("tenderSettlementPickRow", FALLBACK_COLUMNS.pickRow);
  const [current, setCurrent] = useState(-1);
  const shownCurrent = current < 0 && list.rows.length > 0 ? 0 : current;

  const choose = (index: number) => {
    const row = list.rows[index];
    if (!row) return;
    onClose();
    request.onPick(row);
  };

  return (
    <SettlementDialog
      title={request.title}
      subtitle={request.hint}
      size="wide"
      tall
      onClose={onClose}
      footer={
        <>
          <span className={styles.muted}>{list.loading ? "Loading…" : `${list.rows.length} row(s)`}</span>
          <span className={styles.spacer} />
          <button type="button" className={styles.button} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className={styles.primaryButton}
            disabled={shownCurrent < 0 || !list.rows[shownCurrent]}
            onClick={() => choose(shownCurrent)}
          >
            Pick row
          </button>
        </>
      }
    >
      <GridTable
        className={styles.gridGrow}
        columns={columns}
        rows={list.rows}
        loading={list.loading}
        error={list.error}
        current={shownCurrent}
        onCurrent={setCurrent}
        onActivate={choose}
        emptyText="No row of ours waits for this line."
        ariaLabel={request.title}
        autoFocus
      />
    </SettlementDialog>
  );
}
